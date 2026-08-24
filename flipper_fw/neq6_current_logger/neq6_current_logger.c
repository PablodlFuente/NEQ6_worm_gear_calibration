/**
 * NEQ6 Current Logger for Flipper Zero
 *
 * ADC: PA7 / GPIO pin 2, FuriHalAdcChannel12
 * Calibration: Vcal = Vhal * 1.0025189
 * Shunt: I = Vcal / 0.323 ohm, valid range 0..2.5 A
 *
 * The wire protocol is shared by BLE Serial and USB CDC1:
 *   host -> Flipper: START | STOP | RATE <10..1000> | SYNC | INFO
 *   Flipper -> host: OK | ERR ... | SYNC <us> | INFO ...
 *   sample: A5 5A | timestamp_us u32 LE | adc_raw u16 LE
 *
 * CDC0 remains available for qFlipper/CLI. The logger uses CDC1 from the
 * dual-CDC USB configuration, so Windows exposes an additional COM port while
 * this app is running.
 */

#include <furi.h>
#include <furi_hal_adc.h>
#include <furi_hal_cortex.h>
#include <furi_hal_gpio.h>
#include <furi_hal_usb.h>
#include <furi_hal_usb_cdc.h>
#include <bt/bt_service/bt.h>
#include <profiles/serial_profile.h>
#include <gui/gui.h>
#include <stm32wbxx.h>

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define ADC_CAL_K   1.0025189f
#define SHUNT_R_OHM 0.323f
#define MAX_CURRENT 2.5f
#define MAX_CURRENT_RAW \
    ((uint16_t)((MAX_CURRENT * SHUNT_R_OHM * 4095.0f / (2.5f * ADC_CAL_K)) + 0.5f))

#define PA7_CHANNEL FuriHalAdcChannel12

#define RING_SIZE    2048
#define MIN_RATE_HZ  10
#define MAX_RATE_HZ  1000
#define DEFAULT_RATE 100

#define FRAME_SYNC1 0xA5
#define FRAME_SYNC2 0x5A
#define FRAME_SIZE  8
#define TX_BATCH     8 /* 64 bytes: valid for USB CDC and BLE */
#define USB_IFACE    1 /* CDC0 is reserved for CLI/qFlipper */

#define APP_VERSION "v3.1"

typedef struct {
    uint32_t timestamp_us;
    uint16_t adc;
} Sample;

typedef struct {
    volatile bool capturing;
    volatile uint32_t rate_hz;
    volatile uint32_t out_of_range;
    volatile uint32_t overflow;
    volatile uint32_t total;
    Sample ring[RING_SIZE];
    volatile uint16_t head;
    volatile uint16_t tail;
} Logger;

typedef struct {
    char line[48];
} CmdMsg;

typedef struct {
    char data[64];
    uint8_t length;
} LineRx;

typedef struct App App;

struct App {
    Logger logger;

    Bt* bt;
    FuriHalBleProfileBase* ble_profile;
    volatile bool ble_connected;
    LineRx ble_rx;

    FuriHalUsbInterface* previous_usb;
    bool usb_configured;
    volatile bool usb_connected;
    LineRx usb_rx;

    Gui* gui;
    ViewPort* view_port;
    FuriMessageQueue* input_queue;

    FuriThread* adc_thread;
    volatile bool adc_exit;
    FuriTimer* sample_timer;
    FuriMessageQueue* tick_queue;
    FuriMessageQueue* cmd_queue;

    FuriMutex* clock_mutex;
    bool clock_ready;
    uint32_t last_cycles;
    uint64_t accumulated_cycles;
};

static uint16_t ble_event_callback(SerialServiceEvent event, void* context);

/* DWT CYCCNT itself wraps every ~67 seconds. Accumulating unsigned cycle
 * deltas extends it before converting to the protocol's u32 microseconds,
 * whose natural wrap is ~71.6 minutes. */
static uint32_t micros_now(App* app) {
    furi_check(furi_mutex_acquire(app->clock_mutex, FuriWaitForever) == FuriStatusOk);
    const uint32_t now = DWT->CYCCNT;
    if(!app->clock_ready) {
        app->clock_ready = true;
        app->last_cycles = now;
        app->accumulated_cycles = 0;
    } else {
        app->accumulated_cycles += (uint32_t)(now - app->last_cycles);
        app->last_cycles = now;
    }
    const uint32_t us = (uint32_t)(
        app->accumulated_cycles / furi_hal_cortex_instructions_per_microsecond());
    furi_check(furi_mutex_release(app->clock_mutex) == FuriStatusOk);
    return us;
}

static bool send_bytes(App* app, uint8_t* data, uint16_t size) {
    if(app->usb_connected) {
        uint16_t offset = 0;
        while(offset < size) {
            const uint16_t chunk = (size - offset > 64) ? 64 : (size - offset);
            furi_hal_cdc_send(USB_IFACE, data + offset, chunk);
            offset += chunk;
            if(offset < size) furi_delay_ms(2);
        }
        return true;
    }
    if(app->ble_connected && app->ble_profile) {
        return ble_profile_serial_tx(app->ble_profile, data, size);
    }
    return false;
}

static void reply(App* app, const char* format, ...) {
    char buffer[112];
    va_list args;
    va_start(args, format);
    int length = vsnprintf(buffer, sizeof(buffer) - 2, format, args);
    va_end(args);
    if(length <= 0) return;
    if(length > (int)sizeof(buffer) - 2) length = sizeof(buffer) - 2;
    buffer[length++] = '\n';
    send_bytes(app, (uint8_t*)buffer, (uint16_t)length);
}

static void feed_commands(App* app, LineRx* rx, const uint8_t* data, uint16_t size) {
    for(uint16_t i = 0; i < size; i++) {
        const char c = (char)data[i];
        if(c == '\n' || c == '\r') {
            if(rx->length) {
                rx->data[rx->length] = '\0';
                CmdMsg message;
                strncpy(message.line, rx->data, sizeof(message.line) - 1);
                message.line[sizeof(message.line) - 1] = '\0';
                furi_message_queue_put(app->cmd_queue, &message, 0);
                rx->length = 0;
            }
        } else if(rx->length < sizeof(rx->data) - 1) {
            rx->data[rx->length++] = c;
        } else {
            rx->length = 0;
        }
    }
}

static uint16_t ble_event_callback(SerialServiceEvent event, void* context) {
    App* app = context;
    if(event.event == SerialServiceEventTypeDataReceived) {
        feed_commands(app, &app->ble_rx, event.data.buffer, event.data.size);
    }
    return sizeof(app->ble_rx.data) - app->ble_rx.length;
}

/* The system BT service installs its RPC callback at connection time. Reclaim
 * the serial callback here, after that installation has completed. */
static void bt_status_callback(BtStatus status, void* context) {
    App* app = context;
    app->ble_connected = (status == BtStatusConnected);
    if(app->ble_connected && app->ble_profile) {
        ble_profile_serial_set_rpc_active(app->ble_profile, false);
        ble_profile_serial_set_event_callback(
            app->ble_profile, sizeof(app->ble_rx.data), ble_event_callback, app);
    }
}

static void usb_rx_callback(void* context) {
    App* app = context;
    uint8_t buffer[64];
    int32_t length;
    do {
        length = furi_hal_cdc_receive(USB_IFACE, buffer, sizeof(buffer));
        if(length > 0) feed_commands(app, &app->usb_rx, buffer, (uint16_t)length);
    } while(length > 0);
}

static void usb_state_callback(void* context, CdcState state) {
    App* app = context;
    if(state == CdcStateDisconnected) app->usb_connected = false;
}

static void usb_ctrl_callback(void* context, CdcCtrlLine ctrl_lines) {
    App* app = context;
    app->usb_connected = (ctrl_lines & CdcCtrlLineDTR) != 0;
}

static CdcCallbacks usb_callbacks = {
    .tx_ep_callback = NULL,
    .rx_ep_callback = usb_rx_callback,
    .state_callback = usb_state_callback,
    .ctrl_line_callback = usb_ctrl_callback,
    .config_callback = NULL,
};

static void sample_timer_callback(void* context) {
    App* app = context;
    const uint32_t tick = 1;
    if(furi_message_queue_put(app->tick_queue, &tick, 0) != FuriStatusOk) {
        app->logger.overflow++;
    }
}

static int32_t adc_worker(void* context) {
    App* app = context;
    Logger* logger = &app->logger;
    FuriHalAdcHandle* adc = furi_hal_adc_acquire();
    furi_hal_adc_configure_ex(
        adc,
        FuriHalAdcScale2500,
        FuriHalAdcClockSync64,
        FuriHalAdcOversampleNone,
        FuriHalAdcSamplingtime247_5);

    uint32_t tick;
    while(!app->adc_exit) {
        if(furi_message_queue_get(app->tick_queue, &tick, 100) != FuriStatusOk) continue;
        if(!logger->capturing) continue;

        const uint32_t timestamp_us = micros_now(app);
        const uint16_t raw = furi_hal_adc_read(adc, PA7_CHANNEL);
        /* La conversión HAL calibrada dentro del bucle costaba varios ms y
         * limitaba una petición de 1000 Hz a ~320 Hz. El umbral equivalente
         * en cuentas conserva la protección OOR sin frenar la adquisición. */
        if(raw > MAX_CURRENT_RAW) {
            logger->out_of_range++;
            continue;
        }

        const uint16_t next = (uint16_t)((logger->head + 1u) % RING_SIZE);
        if(next == logger->tail) {
            logger->overflow++;
            continue;
        }
        logger->ring[logger->head].timestamp_us = timestamp_us;
        logger->ring[logger->head].adc = raw;
        logger->head = next;
        logger->total++;
    }

    furi_hal_adc_release(adc);
    return 0;
}

static void apply_rate(App* app) {
    const uint32_t tick_frequency = furi_kernel_get_tick_frequency();
    uint32_t period_ticks =
        (tick_frequency + app->logger.rate_hz / 2u) / app->logger.rate_hz;
    if(period_ticks < 1) period_ticks = 1;
    furi_timer_stop(app->sample_timer);
    furi_timer_start(app->sample_timer, period_ticks);
}

static void drain_ticks(App* app) {
    uint32_t ignored;
    while(furi_message_queue_get(app->tick_queue, &ignored, 0) == FuriStatusOk) {
    }
}

static void handle_command(App* app, const char* line) {
    Logger* logger = &app->logger;
    if(strcmp(line, "START") == 0) {
        drain_ticks(app);
        logger->capturing = true;
        apply_rate(app);
        reply(app, "OK");
    } else if(strcmp(line, "STOP") == 0) {
        logger->capturing = false;
        furi_timer_stop(app->sample_timer);
        reply(app, "OK");
    } else if(strncmp(line, "RATE ", 5) == 0) {
        char* end = NULL;
        const long rate = strtol(line + 5, &end, 10);
        if(!end || *end != '\0' || rate < MIN_RATE_HZ || rate > MAX_RATE_HZ) {
            reply(app, "ERR rate %u-%u", MIN_RATE_HZ, MAX_RATE_HZ);
        } else {
            logger->rate_hz = (uint32_t)rate;
            if(logger->capturing) apply_rate(app);
            reply(app, "OK");
        }
    } else if(strcmp(line, "SYNC") == 0) {
        reply(app, "SYNC %lu", (unsigned long)micros_now(app));
    } else if(strcmp(line, "INFO") == 0) {
        const uint32_t ticks =
            (furi_kernel_get_tick_frequency() + logger->rate_hz / 2u) / logger->rate_hz;
        const uint32_t actual = furi_kernel_get_tick_frequency() / (ticks ? ticks : 1u);
        reply(
            app,
            "INFO %s r=%lu a=%lu c=%u oor=%lu ovf=%lu n=%lu",
            APP_VERSION,
            (unsigned long)logger->rate_hz,
            (unsigned long)actual,
            logger->capturing ? 1u : 0u,
            (unsigned long)logger->out_of_range,
            (unsigned long)logger->overflow,
            (unsigned long)logger->total);
    } else {
        reply(app, "ERR cmd");
    }
}

static void flush_ring(App* app) {
    Logger* logger = &app->logger;
    if(logger->tail == logger->head) return;
    if(!app->usb_connected && !app->ble_connected) return;

    uint8_t buffer[FRAME_SIZE * TX_BATCH];
    uint16_t cursor = logger->tail;
    size_t count = 0;
    while(cursor != logger->head && count < TX_BATCH) {
        const Sample sample = logger->ring[cursor];
        uint8_t* frame = &buffer[count * FRAME_SIZE];
        frame[0] = FRAME_SYNC1;
        frame[1] = FRAME_SYNC2;
        frame[2] = (uint8_t)(sample.timestamp_us & 0xFF);
        frame[3] = (uint8_t)((sample.timestamp_us >> 8) & 0xFF);
        frame[4] = (uint8_t)((sample.timestamp_us >> 16) & 0xFF);
        frame[5] = (uint8_t)((sample.timestamp_us >> 24) & 0xFF);
        frame[6] = (uint8_t)(sample.adc & 0xFF);
        frame[7] = (uint8_t)((sample.adc >> 8) & 0xFF);
        cursor = (uint16_t)((cursor + 1u) % RING_SIZE);
        count++;
    }
    if(send_bytes(app, buffer, (uint16_t)(count * FRAME_SIZE))) logger->tail = cursor;
}

static void input_callback(InputEvent* event, void* context) {
    furi_message_queue_put(context, event, 0);
}

static void draw_callback(Canvas* canvas, void* context) {
    App* app = context;
    Logger* logger = &app->logger;
    char text[48];
    canvas_clear(canvas);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 2, 11, "NEQ6 Current");
    canvas_set_font(canvas, FontSecondary);
    snprintf(
        text,
        sizeof(text),
        "BLE:%s USB:%s",
        app->ble_connected ? "ON" : "--",
        app->usb_connected ? "ON" : "--");
    canvas_draw_str(canvas, 2, 23, text);
    snprintf(
        text,
        sizeof(text),
        "%lu Hz  %s",
        (unsigned long)logger->rate_hz,
        logger->capturing ? "REC" : "IDLE");
    canvas_draw_str(canvas, 2, 35, text);
    snprintf(text, sizeof(text), "Samples: %lu", (unsigned long)logger->total);
    canvas_draw_str(canvas, 2, 47, text);
    snprintf(
        text,
        sizeof(text),
        "OOR:%lu OVF:%lu",
        (unsigned long)logger->out_of_range,
        (unsigned long)logger->overflow);
    canvas_draw_str(canvas, 2, 59, text);
    if(logger->capturing) canvas_draw_box(canvas, 118, 2, 8, 8);
}

static void setup_usb(App* app) {
    app->previous_usb = furi_hal_usb_get_config();
    if(furi_hal_usb_is_locked()) return;
    if(furi_hal_usb_set_config(&usb_cdc_dual, NULL)) {
        furi_delay_ms(150);
        furi_hal_cdc_set_callbacks(USB_IFACE, &usb_callbacks, app);
        app->usb_configured = true;
    }
}

static void setup_bluetooth(App* app) {
    app->bt = furi_record_open(RECORD_BT);
    bt_set_status_changed_callback(app->bt, bt_status_callback, app);
    bt_disconnect(app->bt);
    app->ble_profile = bt_profile_start(app->bt, ble_profile_serial, NULL);
    if(app->ble_profile) {
        ble_profile_serial_set_rpc_active(app->ble_profile, false);
        ble_profile_serial_set_event_callback(
            app->ble_profile, sizeof(app->ble_rx.data), ble_event_callback, app);
    }
}

int32_t neq6_logger_app(void* argument) {
    UNUSED(argument);
    App* app = calloc(1, sizeof(App));
    furi_check(app);
    app->logger.rate_hz = DEFAULT_RATE;

    furi_hal_gpio_init(&gpio_ext_pa7, GpioModeAnalog, GpioPullNo, GpioSpeedLow);

    app->clock_mutex = furi_mutex_alloc(FuriMutexTypeNormal);
    app->tick_queue = furi_message_queue_alloc(32, sizeof(uint32_t));
    app->cmd_queue = furi_message_queue_alloc(8, sizeof(CmdMsg));
    app->input_queue = furi_message_queue_alloc(8, sizeof(InputEvent));
    app->sample_timer =
        furi_timer_alloc(sample_timer_callback, FuriTimerTypePeriodic, app);

    app->adc_thread = furi_thread_alloc_ex("NEQ6ADC", 2048, adc_worker, app);
    furi_thread_start(app->adc_thread);

    setup_usb(app);
    setup_bluetooth(app);

    app->gui = furi_record_open(RECORD_GUI);
    app->view_port = view_port_alloc();
    view_port_draw_callback_set(app->view_port, draw_callback, app);
    view_port_input_callback_set(app->view_port, input_callback, app->input_queue);
    gui_add_view_port(app->gui, app->view_port, GuiLayerFullscreen);

    bool running = true;
    uint32_t last_redraw = 0;
    while(running) {
        InputEvent event;
        if(furi_message_queue_get(app->input_queue, &event, 2) == FuriStatusOk &&
           event.type == InputTypeShort && event.key == InputKeyBack) {
            running = false;
        }

        CmdMsg command;
        while(furi_message_queue_get(app->cmd_queue, &command, 0) == FuriStatusOk) {
            handle_command(app, command.line);
        }
        flush_ring(app);

        const uint32_t now = furi_get_tick();
        if(now - last_redraw >= furi_ms_to_ticks(100)) {
            last_redraw = now;
            view_port_update(app->view_port);
        }
    }

    app->logger.capturing = false;
    furi_timer_stop(app->sample_timer);
    app->adc_exit = true;
    furi_thread_join(app->adc_thread);
    furi_thread_free(app->adc_thread);
    furi_timer_free(app->sample_timer);

    if(app->ble_profile) {
        ble_profile_serial_set_event_callback(app->ble_profile, 0, NULL, NULL);
    }
    bt_set_status_changed_callback(app->bt, NULL, NULL);
    bt_disconnect(app->bt);
    bt_profile_restore_default(app->bt);
    furi_record_close(RECORD_BT);

    if(app->usb_configured) {
        furi_hal_cdc_set_callbacks(USB_IFACE, NULL, NULL);
        if(app->previous_usb) furi_hal_usb_set_config(app->previous_usb, NULL);
    }

    gui_remove_view_port(app->gui, app->view_port);
    view_port_enabled_set(app->view_port, false);
    view_port_free(app->view_port);
    furi_record_close(RECORD_GUI);

    furi_message_queue_free(app->tick_queue);
    furi_message_queue_free(app->cmd_queue);
    furi_message_queue_free(app->input_queue);
    furi_mutex_free(app->clock_mutex);
    free(app);
    return 0;
}
