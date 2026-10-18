package org.firstinspires.ftc.robotcore.external.navigation;

public enum CurrentUnit {
    AMPS(1.0), MILLIAMPS(0.001);
    private final double amps;
    CurrentUnit(double amps) { this.amps = amps; }
    public double toAmps(double value) { return value * amps; }
    public double toMilliAmps(double value) { return value * amps * 1000; }
    /** converts value (expressed in unit) into this unit */
    public double convert(double value, CurrentUnit unit) { return unit.toAmps(value) / amps; }
}
