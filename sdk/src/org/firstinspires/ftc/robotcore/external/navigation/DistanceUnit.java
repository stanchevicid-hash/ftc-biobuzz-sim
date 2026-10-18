package org.firstinspires.ftc.robotcore.external.navigation;

import java.util.Locale;

public enum DistanceUnit {
    METER(0), CM(1), MM(2), INCH(3);
    public final byte bVal;
    public static final double infinity = Double.MAX_VALUE;
    public static final double mmPerInch = 25.4;
    public static final double mPerInch = 0.0254;
    DistanceUnit(int i) { bVal = (byte) i; }

    private double perMeter() { switch (this) { case METER: return 1; case CM: return 100; case MM: return 1000; default: return 1 / mPerInch; } }
    public double fromMeters(double meters) { return meters == infinity ? infinity : meters * perMeter(); }
    public double fromInches(double inches) { return inches == infinity ? infinity : fromMeters(inches * mPerInch); }
    public double fromCm(double cm) { return cm == infinity ? infinity : fromMeters(cm / 100); }
    public double fromMm(double mm) { return mm == infinity ? infinity : fromMeters(mm / 1000); }
    public double fromUnit(DistanceUnit him, double his) { return his == infinity ? infinity : fromMeters(him.toMeters(his)); }
    public double toMeters(double v) { return v == infinity ? infinity : v / perMeter(); }
    public double toInches(double v) { return v == infinity ? infinity : toMeters(v) / mPerInch; }
    public double toCm(double v) { return v == infinity ? infinity : toMeters(v) * 100; }
    public double toMm(double v) { return v == infinity ? infinity : toMeters(v) * 1000; }
    public String toString(double inOurUnits) { return String.format(Locale.getDefault(), "%.3f%s", inOurUnits, toString()); }
    @Override public String toString() { switch (this) { case METER: return "m"; case CM: return "cm"; case MM: return "mm"; default: return "in"; } }
}
