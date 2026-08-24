/**
 * NEQ6 Current Logger — aplicación FAP para Flipper Zero
 * =======================================================
 * Mide la corriente del motor AR de una NEQ6 mediante shunt externo en PA7
 * (pin físico 2 del GPIO) y la envía por Bluetooth al programa del PC.
 *
 * Adaptado al SDK ACTUAL (Momentum / oficial 2024+):
 *  - NO usa furi_hal_bt_serial.h (no existe).
 *  - NO usa la variable ble_profile_serial (deshabilitada para FAPs).
 *  - Usa las funciones ble_profile_serial_* de <extra_profiles.h>, que son
 *    exactamente las que utiliza la app oficial "Bluetooth Serial" (que es
 *    un FAP externo), por lo que están exportadas en la tabla de API.
 *  - ADC con la conversión oficial furi_hal_adc_convert_to_voltage().
 *
 * CADENA DE MEDIDA (Configuración A)
 *   shunt: (0.17 + 0.17 = 0.34 Ω) // 0.65 Ω  +  0.10 Ω  →  R_total = 0.323 Ω
 *   PA7 → ADC (2.5 V ref, 12 bits)
 *   V    = furi_hal_adc_convert_to_voltage() [mV oficiales del HAL]
 *   Vc   = V × ADC_CAL_K                     (calibración experimental)
 *   I    = Vc / SHUNT_R_OHM                  (0 … 2.5 A)
 *
 * PROTOCOLO (idéntico al que espera el PC, NO MODIFICAR)
 *   PC → Flipper : START | STOP | RATE <hz> | SYNC | INFO
 *   Flipper → PC : OK | ERR ... | SYNC <timestamp_us> | INFO ...
 *   Trama binaria (8 bytes, una por muestra):
 *       A5 5A | timestamp_us u32 LE | adc_raw u16 LE
 *   Se transmite el ADC RAW; el PC aplica la conversión.
 *
 * RESOLUCIÓN TEMPORAL (honesto)
 *   - timestamp: contador de hardware DWT (ciclo de CPU, 64 MHz) dividido por
 *     las instrucciones/µs → microsegundos reales. El campo u32 desborda cada
 *     ~67 s; el PC hace unwrap de deltas.
 *   - temporizador de muestreo: FuriTimer (FreeRTOS). En Flipper el tick del
 *     kernel es de 1 ms, así que el periodo programado se redondea a 1 ms.
 *     A 1000 Hz se muestrea en cada tick (1 kHz nominal, con jitter de tick).
 *
 * ARQUITECTURA
 *   FuriTimer (periodo según RATE)
 *        ↓  mensaje no bloqueante
 *   cola de ticks → hilo ADC → ring buffer 2048 → hilo principal → BLE
 *   La adquisición nunca espera al Bluetooth.
 */

#include <furi.h>
#include <furi_hal_adc.h>
#include <furi_hal_cortex.h>
#include <bt/bt_service/bt.h>
#include <extra_profiles.h>
#include <gui/gui.h>
#include <stm32wbxx.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ── constantes físicas (calibradas, no recalcular) ───── */
#define ADC_CAL_K    1.0025189f /* V_cal = V_adc × K (experimental, 0.500 V) */
#define SHUNT_R_OHM  0.323f     /* (0.34 // 0.65) + 0.10 */
#define MAX_CURRENT  2.5f       /* rango operativo 0 … 2.5 A */

/* ── adquisición ──────────────────────────────────────── */
#define PA7_CHANNEL FuriHalAdcChannel12 /* PA7 = canal 12 en Flipper Zero */

#define RING_SIZE     2048
#define MIN_RATE_HZ   10
#define MAX_RATE_HZ   1000
#define DEFAULT_RATE  100

/* ── protocolo ────────────────────────────────────────── */
#define FRAME_SYNC1 0xA5
#define FRAME_SYNC2 0x5A
#define FRAME_SIZE  8 /* A5 5A | ts u32 LE | adc u16 LE */
#define FLUSH_BATCH 24 /* muestras por ble_profile_serial_tx (192 B) */

#define APP_VERSION "v2.0"

typedef struct {
    uint32_t timestamp_us;
    uint16_t adc;
} Sample;

typedef struct {
    volatile bool capturing;
    volatile uint32_t rate_hz;
    volatile uint32_t dropped;  /* fuera de rango 0…2.5 A (tras convertir) */
    volatile uint32_t overflow; /* ring lleno: BLE no da abasto */
    volatile uint32_t total;    /* muestras adquiridas válidas */

    Sample ring[RING_SIZE];
    volatile uint16_t head;
    volatile uint16_t tail;
} Logger;

typedef struct {
    char line[48];
} CmdMsg;

typedef struct {
    Logger logger;

    Bt* bt;
    FuriHalBleProfileBase* profile;
    volatile bool bt_connected;

    Gui* gui;
    ViewPort* view_port;
    FuriMessageQueue* input_queue;

    FuriThread* adc_thread;
    volatile bool adc_exit;

    FuriTimer* sample_timer;
    FuriMessageQueue* tick_queue;
    FuriMessageQueue* cmd_queue;

    /* acumulador de línea RX (solo lo toca el hilo BLE) */
    char rx_buf[64];
    uint8_t rx_len;
} App;

/* ── timestamp en microsegundos (hardware DWT) ────────── */
static inline uint32_t micros_now(void) {
    return DWT->CYCCNT / furi_hal_cortex_instructions_per_microsecond();
}

/* ── envío de respuestas de texto ─────────────────────── */
static void reply(App* app, const char* fmt, ...) {
    if(!app->profile) return;
    char buf[96];
    va_list args;
    va_start(args, fmt);
    int len = vsnprintf(buf, sizeof(buf) - 1, fmt, args);
    va_end(args);
    if(len <= 0) return;
    buf[len] = '\n';
    ble_profile_serial_tx(app->profile, (uint8_t*)buf, (uint16_t)(len + 1));
}

/* ── callback de datos BLE (hilo del stack BT) ────────── */
static void serial_event_callback(FuriHalBtSerialCallbackEvent event, void* context) {
    App* app = context;
    if(event.event != FuriHalBtSerialCallbackEventTypeDataReceived) return;

    for(uint16_t i = 0; i < event.data_received.size; i++) {
        char c = (char)event.data_received.buffer[i];
        if(c == '\n' || c == '\r') {
            if(app->rx_len > 0) {
                app->rx_buf[app->rx_len] = '\0';
                CmdMsg msg;
                strncpy(msg.line, app->rx_buf, sizeof(msg.line) - 1);
                msg.line[sizeof(msg.line) - 1] = '\0';
                furi_message_queue_put(app->cmd_queue, &msg, 0);
                app->rx_len = 0;
            }
        } else if(app->rx_len < sizeof(app->rx_buf) - 1) {
            app->rx_buf[app->rx_len++] = c;
        }
    }
}

/* ── callback de estado del servicio BT ───────────────── */
static void bt_status_callback(BtStatus status, void* context) {
    App* app = context;
    app->bt_connected = (status == BtStatusConnected);
}

/* ── temporizador de muestreo → cola de ticks ─────────── */
static void sample_timer_callback(void* context) {
    App* app = context;
    uint32_t one = 1;
    /* no bloqueante: si la cola está llena, el hilo ADC va atrasado */
    furi_message_queue_put(app->tick_queue, &one, 0);
}

/* ── hilo de adquisición ADC ──────────────────────────── */
static int32_t adc_worker(void* context) {
    App* app = context;
    Logger* lg = &app->logger;

    FuriHalAdcHandle* adc = furi_hal_adc_acquire();
    /* misma configuración validada en las pruebas de PA7 */
    furi_hal_adc_configure_ex(
        adc,
        FuriHalAdcScale2500,
        FuriHalAdcClockSync64,
        FuriHalAdcOversampleNone,
        FuriHalAdcSamplingtime247_5);

    uint32_t tick;
    while(!app->adc_exit) {
        if(furi_message_queue_get(app->tick_queue, &tick, 100) != FuriStatusOk) continue;
        if(!lg->capturing) continue; /* drenar ticks viejos */

        uint32_t ts = micros_now();
        uint16_t raw = furi_hal_adc_read(adc, PA7_CHANNEL);

        /* conversión oficial del HAL → mV, y después calibración + shunt */
        float v_cal = ((float)furi_hal_adc_convert_to_voltage(adc, raw) / 1000.0f) * ADC_CAL_K;
        float i_amps = v_cal / SHUNT_R_OHM;

        /* límite comprobado sobre la corriente real, no sobre el raw */
        if(i_amps < 0.0f || i_amps > MAX_CURRENT) {
            lg->dropped++;
            continue;
        }

        uint16_t next = (uint16_t)((lg->head + 1u) % RING_SIZE);
        if(next == lg->tail) {
            lg->overflow++; /* BLE ocupado: la muestra se queda sin sitio */
            continue;
        }
        lg->ring[lg->head].timestamp_us = ts;
        lg->ring[lg->head].adc = raw; /* el protocolo exige ADC raw */
        lg->head = next;
        lg->total++;
    }

    furi_hal_adc_release(adc);
    return 0;
}

/* ── vaciado del ring → BLE ───────────────────────────── */
static void flush_ring(App* app) {
    Logger* lg = &app->logger;
    if(!app->profile) return;

    static uint8_t buf[FRAME_SIZE * FLUSH_BATCH];
    while(lg->tail != lg->head) {
        size_t n = 0;
        while(lg->tail != lg->head && n < FLUSH_BATCH) {
            Sample s = lg->ring[lg->tail];
            lg->tail = (uint16_t)((lg->tail + 1u) % RING_SIZE);
            uint8_t* p = &buf[n * FRAME_SIZE];
            p[0] = FRAME_SYNC1;
            p[1] = FRAME_SYNC2;
            p[2] = (uint8_t)(s.timestamp_us & 0xFF);
            p[3] = (uint8_t)((s.timestamp_us >> 8) & 0xFF);
            p[4] = (uint8_t)((s.timestamp_us >> 16) & 0xFF);
            p[5] = (uint8_t)((s.timestamp_us >> 24) & 0xFF);
            p[6] = (uint8_t)(s.adc & 0xFF);
            p[7] = (uint8_t)((s.adc >> 8) & 0xFF);
            n++;
        }
        ble_profile_serial_tx(app->profile, buf, (uint16_t)(n * FRAME_SIZE));
    }
}

/* ── control de la tasa (10 … 1000 Hz) ────────────────── */
static void apply_rate(App* app) {
    uint32_t period_us = 1000000UL / app->logger.rate_hz;
    if(period_us < 1000) period_us = 1000; /* el tick del kernel es 1 ms */
    furi_timer_stop(app->sample_timer);
    furi_timer_start(app->sample_timer, period_us);
}

static void drain_ticks(App* app) {
    uint32_t dummy;
    while(furi_message_queue_get(app->tick_queue, &dummy, 0) == FuriStatusOk) {
    }
}

/* ── procesamiento de comandos del PC ─────────────────── */
static void handle_command(App* app, const char* line) {
    Logger* lg = &app->logger;

    if(strncmp(line, "START", 5) == 0) {
        drain_ticks(app);
        lg->capturing = true;
        apply_rate(app);
        reply(app, "OK");
    } else if(strncmp(line, "STOP", 4) == 0) {
        lg->capturing = false;
        furi_timer_stop(app->sample_timer);
        reply(app, "OK");
    } else if(strncmp(line, "RATE ", 5) == 0) {
        long hz = strtol(line + 5, NULL, 10);
        if(hz < MIN_RATE_HZ || hz > MAX_RATE_HZ) {
            reply(app, "ERR rate %d-%d", MIN_RATE_HZ, MAX_RATE_HZ);
        } else {
            lg->rate_hz = (uint32_t)hz;
            if(lg->capturing) apply_rate(app);
            reply(app, "OK");
        }
    } else if(strncmp(line, "SYNC", 4) == 0) {
        /* handshake de reloj: el PC calcula offset y drift con esto */
        reply(app, "SYNC %lu", (unsigned long)micros_now());
    } else if(strncmp(line, "INFO", 4) == 0) {
        reply(
            app,
            "INFO neq6-logger %s rate=%lu cap=%d drop=%lu ovf=%lu total=%lu",
            APP_VERSION,
            (unsigned long)lg->rate_hz,
            (int)lg->capturing,
            (unsigned long)lg->dropped,
            (unsigned long)lg->overflow,
            (unsigned long)lg->total);
    } else {
        reply(app, "ERR cmd");
    }
}

/* ── GUI ──────────────────────────────────────────────── */
static void input_callback(InputEvent* event, void* context) {
    FuriMessageQueue* q = context;
    furi_message_queue_put(q, event, 0);
}

static void draw_callback(Canvas* canvas, void* context) {
    App* app = context;
    Logger* lg = &app->logger;
    char s[48];

    canvas_clear(canvas);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 2, 12, "NEQ6 Current");

    canvas_set_font(canvas, FontSecondary);
    snprintf(s, sizeof(s), "BLE: %s", app->bt_connected ? "conectado" : "esperando");
    canvas_draw_str(canvas, 2, 24, s);
    snprintf(s, sizeof(s), "Rate: %lu Hz   %s", (unsigned long)lg->rate_hz, lg->capturing ? "REC" : "IDLE");
    canvas_draw_str(canvas, 2, 36, s);
    snprintf(s, sizeof(s), "Muestras: %lu", (unsigned long)lg->total);
    canvas_draw_str(canvas, 2, 48, s);
    snprintf(s, sizeof(s), "Drop: %lu  Ovf: %lu", (unsigned long)lg->dropped, (unsigned long)lg->overflow);
    canvas_draw_str(canvas, 2, 60, s);

    if(lg->capturing) {
        canvas_draw_box(canvas, 118, 2, 8, 8);
    }
}

/* ── punto de entrada ─────────────────────────────────── */
int32_t neq6_logger_app(void* p) {
    UNUSED(p);

    App* app = malloc(sizeof(App));
    memset(app, 0, sizeof(App));
    app->logger.rate_hz = DEFAULT_RATE;
    app->logger.capturing = false; /* NO medir hasta recibir START */

    /* colas y temporizador */
    app->tick_queue = furi_message_queue_alloc(8, sizeof(uint32_t));
    app->cmd_queue = furi_message_queue_alloc(8, sizeof(CmdMsg));
    app->input_queue = furi_message_queue_alloc(8, sizeof(InputEvent));
    app->sample_timer =
        furi_timer_alloc(sample_timer_callback, FuriTimerTypePeriodic, app);

    /* hilo ADC (adquisición desacoplada del BLE) */
    app->adc_thread = furi_thread_alloc_ex("NEQ6ADC", 2048, adc_worker, app);
    furi_thread_start(app->adc_thread);

    /* Bluetooth: perfil serie del propio firmware (el mismo que usa la app
     * oficial "Bluetooth Serial"); sin stack propio ni UUIDs inventados. */
    app->bt = furi_record_open(RECORD_BT);
    bt_disconnect(app->bt);
    furi_delay_ms(200);
    app->profile = ble_profile_serial_start(NULL);
    if(app->profile) {
        ble_profile_serial_set_rpc_active(app->profile, false);
        ble_profile_serial_set_event_callback(
            app->profile, 1024, serial_event_callback, app);
    }
    bt_set_status_changed_callback(app->bt, bt_status_callback, app);
    bt_set_profile(app->bt, BtProfileSerial);

    /* GUI */
    app->gui = furi_record_open(RECORD_GUI);
    app->view_port = view_port_alloc();
    view_port_draw_callback_set(app->view_port, draw_callback, app);
    view_port_input_callback_set(app->view_port, input_callback, app->input_queue);
    gui_add_view_port(app->gui, app->view_port, GuiLayerFullscreen);

    /* bucle principal: eventos, comandos y vaciado del ring */
    bool running = true;
    while(running) {
        InputEvent event;
        if(furi_message_queue_get(app->input_queue, &event, 10) == FuriStatusOk) {
            if(event.type == InputTypeShort && event.key == InputKeyBack) {
                running = false;
            }
        }

        CmdMsg msg;
        while(furi_message_queue_get(app->cmd_queue, &msg, 0) == FuriStatusOk) {
            handle_command(app, msg.line);
        }

        flush_ring(app);
        view_port_update(app->view_port);
    }

    /* desmontaje ordenado */
    app->logger.capturing = false;
    furi_timer_stop(app->sample_timer);

    app->adc_exit = true;
    furi_thread_join(app->adc_thread);
    furi_thread_free(app->adc_thread);
    furi_timer_free(app->sample_timer);

    if(app->profile) {
        ble_profile_serial_set_event_callback(app->profile, 0, NULL, NULL);
    }
    bt_set_status_changed_callback(app->bt, NULL, NULL);
    bt_disconnect(app->bt);
    furi_record_close(RECORD_BT);

    view_port_enabled_set(app->view_port, false);
    gui_remove_view_port(app->gui, app->view_port);
    furi_record_close(RECORD_GUI);
    view_port_free(app->view_port);

    furi_message_queue_free(app->tick_queue);
    furi_message_queue_free(app->cmd_queue);
    furi_message_queue_free(app->input_queue);

    free(app);
    return 0;
}
