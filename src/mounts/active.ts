import { skyWatcherEq6Driver } from "./skywatcher-eq6";

/** Punto único de selección del controlador. En el futuro podrá resolverse
 * desde configuración sin alterar la interfaz de medida ni las gráficas. */
export const ACTIVE_MOUNT_DRIVER = skyWatcherEq6Driver;
