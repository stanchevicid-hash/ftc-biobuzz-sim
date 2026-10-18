package com.qualcomm.robotcore.util;

import ftcsim.Sim;

/** Goes to the simulator log panel. */
public class RobotLog {
    private static void out(String level, String tag, String format, Object... args) {
        String msg = args == null || args.length == 0 ? format : String.format(format, args);
        Sim.addLog(level + (tag != null ? "/" + tag : "") + ": " + msg);
    }
    public static void v(String format, Object... args) { out("V", null, format, args); }
    public static void vv(String tag, String format, Object... args) { out("V", tag, format, args); }
    public static void d(String format, Object... args) { out("D", null, format, args); }
    public static void dd(String tag, String format, Object... args) { out("D", tag, format, args); }
    public static void i(String format, Object... args) { out("I", null, format, args); }
    public static void ii(String tag, String format, Object... args) { out("I", tag, format, args); }
    public static void w(String format, Object... args) { out("W", null, format, args); }
    public static void ww(String tag, String format, Object... args) { out("W", tag, format, args); }
    public static void e(String format, Object... args) { out("E", null, format, args); }
    public static void ee(String tag, String format, Object... args) { out("E", tag, format, args); }
    public static void ee(String tag, Throwable t, String format, Object... args) { out("E", tag, format + " : " + t, args); }
    public static void logStackTrace(Throwable t) { out("E", null, String.valueOf(t)); }
    public static void addGlobalWarningMessage(String format, Object... args) { out("W", "GLOBAL", format, args); }
}
