package com.qualcomm.robotcore.util;

import ftcsim.Sim;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/** Runs on simulation time, so pausing or speeding up the simulator keeps OpMode timing consistent. */
public class ElapsedTime {
    public static final long SECOND_IN_NANO = 1000000000L;
    public static final long MILLIS_IN_NANO = 1000000L;
    protected volatile long nsStartTime;
    protected final double resolution;

    public enum Resolution { SECONDS, MILLISECONDS }

    public ElapsedTime() { reset(); resolution = SECOND_IN_NANO; }
    public ElapsedTime(long startTime) { nsStartTime = startTime; resolution = SECOND_IN_NANO; }
    public ElapsedTime(Resolution r) { reset(); resolution = r == Resolution.SECONDS ? SECOND_IN_NANO : MILLIS_IN_NANO; }

    protected long nsNow() { return Sim.nanoTime(); }
    public long now(TimeUnit unit) { return unit.convert(nsNow(), TimeUnit.NANOSECONDS); }
    public void reset() { nsStartTime = nsNow(); }
    public double startTime() { return nsStartTime / resolution; }
    public long startTimeNanoseconds() { return nsStartTime; }
    public double time() { return (nsNow() - nsStartTime) / resolution; }
    public long time(TimeUnit unit) { return unit.convert(nanoseconds(), TimeUnit.NANOSECONDS); }
    public double seconds() { return nanoseconds() * 1e-9; }
    public double milliseconds() { return seconds() * 1000; }
    public long nanoseconds() { return nsNow() - nsStartTime; }
    public Resolution getResolution() { return resolution == SECOND_IN_NANO ? Resolution.SECONDS : Resolution.MILLISECONDS; }
    public void log(String label) { RobotLog.v(String.format(Locale.US, "TIMER: %20s - %1.3f %s", label, time(), resolution == SECOND_IN_NANO ? "seconds" : "milliseconds")); }
    @Override public String toString() { return String.format(Locale.US, "%1.4f %s", time(), resolution == SECOND_IN_NANO ? "seconds" : "milliseconds"); }
}
