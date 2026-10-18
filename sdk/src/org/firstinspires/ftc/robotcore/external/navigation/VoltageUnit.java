package org.firstinspires.ftc.robotcore.external.navigation;

public enum VoltageUnit {
    VOLTS(1.0), MILLIVOLTS(0.001);
    private final double volts;
    VoltageUnit(double volts) { this.volts = volts; }
    public double toVolts(double value) { return value * volts; }
    public double toMilliVolts(double value) { return value * volts * 1000; }
    public double convert(double value, VoltageUnit unit) { return unit.toVolts(value) / volts; }
}
