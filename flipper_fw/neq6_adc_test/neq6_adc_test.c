#include <furi.h>
#include <furi_hal.h>
#include <furi_hal_adc.h>
#include <furi_hal_gpio.h>
#include <furi_hal_resources.h>

#include <gui/gui.h>
#include <gui/view_port.h>
#include <input/input.h>

#include <math.h>
#include <stdio.h>

#define ADC_CHANNEL FuriHalAdcChannel12

/*
 * Tensión REAL aplicada físicamente a PA7.
 * Cambia este valor cuando hagamos otra calibración.
 */
#define KNOWN_VOLTAGE 0.500f

/*
 * Número de muestras.
 */
#define NUM_SAMPLES 1000

/*
 * Tiempo entre muestras.
 */
#define SAMPLE_INTERVAL_MS 10

typedef struct {
    uint16_t raw;
    float voltage;
    float k_mean;
    float k_std;
    float voltage_mean;
    bool measuring;
    bool finished;
    bool exit;
} AppState;


/* ---------------------------------------------------------
 * Leer ADC y convertir mediante el HAL
 * --------------------------------------------------------- */

static float read_adc_voltage(
    FuriHalAdcHandle* adc,
    uint16_t* raw) {

    *raw = furi_hal_adc_read(
        adc,
        ADC_CHANNEL);

    /*
     * furi_hal_adc_convert_to_voltage()
     * devuelve mV.
     */
    float millivolts =
        furi_hal_adc_convert_to_voltage(
            adc,
            *raw);

    return millivolts / 1000.0f;
}


/* ---------------------------------------------------------
 * Calibración
 * --------------------------------------------------------- */

static void perform_calibration(AppState* state) {

    FuriHalAdcHandle* adc =
        furi_hal_adc_acquire();

    if(!adc) {
        state->finished = true;
        return;
    }

    /*
     * PA7 = pin físico 2 = ADC12
     */
    furi_hal_gpio_init(
        &gpio_ext_pa7,
        GpioModeAnalog,
        GpioPullNo,
        GpioSpeedLow);

    /*
     * Configuración ADC.
     */
    furi_hal_adc_configure_ex(
        adc,
        FuriHalAdcScale2500,
        FuriHalAdcClockSync64,
        FuriHalAdcOversampleNone,
        FuriHalAdcSamplingtime247_5);

    state->measuring = true;

    /*
     * Usamos float en todas las operaciones.
     * Evitamos double-promotion, que el compilador
     * del firmware trata como error.
     */
    float sum_k = 0.0f;
    float sum_k_squared = 0.0f;
    float sum_voltage = 0.0f;

    uint32_t valid_samples = 0;

    for(uint32_t i = 0; i < NUM_SAMPLES; i++) {

        uint16_t raw = 0;

        float voltage =
            read_adc_voltage(
                adc,
                &raw);

        state->raw = raw;
        state->voltage = voltage;

        /*
         * Ignoramos valores inválidos o muy próximos a cero.
         */
        if(voltage > 0.000001f) {

            float k =
                KNOWN_VOLTAGE / voltage;

            sum_k += k;

            sum_k_squared += k * k;

            sum_voltage += voltage;

            valid_samples++;
        }

        furi_delay_ms(
            SAMPLE_INTERVAL_MS);
    }

    furi_hal_adc_release(adc);

    /*
     * Evitar división por cero.
     */
    if(valid_samples == 0) {

        state->k_mean = 0.0f;
        state->k_std = 0.0f;
        state->voltage_mean = 0.0f;

        state->measuring = false;
        state->finished = true;

        return;
    }

    /*
     * Media de K.
     */
    state->k_mean =
        sum_k / (float)valid_samples;

    /*
     * Tensión media.
     */
    state->voltage_mean =
        sum_voltage / (float)valid_samples;

    /*
     * Varianza:
     *
     * Var(K) =
     * E[K²] - E[K]²
     */
    float mean_k_squared =
        sum_k_squared / (float)valid_samples;

    float variance =
        mean_k_squared -
        (state->k_mean * state->k_mean);

    /*
     * Evitar un pequeño negativo por
     * error numérico de coma flotante.
     */
    if(variance < 0.0f) {
        variance = 0.0f;
    }

    state->k_std =
        sqrtf(variance);

    state->measuring = false;
    state->finished = true;
}


/* ---------------------------------------------------------
 * GUI
 * --------------------------------------------------------- */

static void draw_callback(
    Canvas* canvas,
    void* ctx) {

    AppState* state = ctx;

    canvas_clear(canvas);

    canvas_set_font(
        canvas,
        FontPrimary);

    canvas_draw_str(
        canvas,
        2,
        11,
        "ADC CALIBRATION");

    canvas_set_font(
        canvas,
        FontSecondary);

    char text[40];

    snprintf(
        text,
        sizeof(text),
        "REAL: %.3f V",
        (double)KNOWN_VOLTAGE);

    canvas_draw_str(
        canvas,
        2,
        23,
        text);

    if(state->measuring) {

        canvas_draw_str(
            canvas,
            2,
            38,
            "MEASURING...");

        snprintf(
            text,
            sizeof(text),
            "V: %.5f V",
            (double)state->voltage);

        canvas_draw_str(
            canvas,
            2,
            50,
            text);

        snprintf(
            text,
            sizeof(text),
            "RAW: %u",
            state->raw);

        canvas_draw_str(
            canvas,
            2,
            62,
            text);

    } else if(state->finished) {

        snprintf(
            text,
            sizeof(text),
            "Vmean: %.5f V",
            (double)state->voltage_mean);

        canvas_draw_str(
            canvas,
            2,
            35,
            text);

        snprintf(
            text,
            sizeof(text),
            "K: %.7f",
            (double)state->k_mean);

        canvas_draw_str(
            canvas,
            2,
            47,
            text);

        snprintf(
            text,
            sizeof(text),
            "STD: %.7f",
            (double)state->k_std);

        canvas_draw_str(
            canvas,
            2,
            59,
            text);
    }
}


/* ---------------------------------------------------------
 * INPUT
 * --------------------------------------------------------- */

static void input_callback(
    InputEvent* event,
    void* ctx) {

    AppState* state = ctx;

    if(
        event->type == InputTypePress &&
        event->key == InputKeyBack) {

        state->exit = true;
    }
}


/* ---------------------------------------------------------
 * APP
 * --------------------------------------------------------- */

int32_t neq6_adc_test_app(void* p) {

    UNUSED(p);

    AppState state = {
        .raw = 0,
        .voltage = 0.0f,
        .k_mean = 0.0f,
        .k_std = 0.0f,
        .voltage_mean = 0.0f,
        .measuring = false,
        .finished = false,
        .exit = false,
    };

    /*
     * Configurar PA7 como analógico.
     */
    furi_hal_gpio_init(
        &gpio_ext_pa7,
        GpioModeAnalog,
        GpioPullNo,
        GpioSpeedLow);

    /*
     * GUI.
     */
    ViewPort* viewport =
        view_port_alloc();

    view_port_draw_callback_set(
        viewport,
        draw_callback,
        &state);

    view_port_input_callback_set(
        viewport,
        input_callback,
        &state);

    Gui* gui =
        furi_record_open(
            RECORD_GUI);

    gui_add_view_port(
        gui,
        viewport,
        GuiLayerFullscreen);

    view_port_update(viewport);

    /*
     * Pequeña pausa para que aparezca
     * la pantalla antes de empezar.
     */
    furi_delay_ms(500);

    /*
     * Medición.
     */
    perform_calibration(&state);

    view_port_update(viewport);

    /*
     * Mantener resultado.
     */
    while(!state.exit) {

        view_port_update(viewport);

        furi_delay_ms(100);
    }

    /*
     * Limpieza.
     */
    gui_remove_view_port(
        gui,
        viewport);

    furi_record_close(
        RECORD_GUI);

    view_port_free(viewport);

    return 0;
}