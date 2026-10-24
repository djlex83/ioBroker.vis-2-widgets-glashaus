/* Scenario for the harness: one widget with attributes and simulated object IDs.
 * Put scenarios in dev/scenarios/<Widget>.ts as `export default [ ... ] satisfies Scenario[]`. */
export interface StateDef {
    /** Fixed value, or a function of the time (ms) that is called every 2 s */
    val: ioBroker.StateValue | ((t: number) => ioBroker.StateValue);
    name?: string;
    unit?: string;
    type?: string;
    role?: string;
}

export interface Scenario {
    /** File name of the widget, e.g. 'GlashausValue' */
    widget: string;
    /** Short name, used in the URL (?s=...) */
    name: string;
    w: number;
    h: number;
    /** Widget attributes (rxData); missing ones take the defaults of getWidgetInfo() */
    data?: Record<string, any>;
    /** Simulated object IDs used by this scenario */
    states?: Record<string, StateDef>;
}
