package org.firstinspires.ftc.robotcore.external.navigation;

import java.util.Locale;

public class AngularVelocity {
    public UnnormalizedAngleUnit unit;
    public float xRotationRate, yRotationRate, zRotationRate;
    public long acquisitionTime;
    public AngularVelocity() { this(UnnormalizedAngleUnit.DEGREES, 0, 0, 0, 0); }
    public AngularVelocity(UnnormalizedAngleUnit unit, float x, float y, float z, long acquisitionTime) {
        this.unit = unit; xRotationRate = x; yRotationRate = y; zRotationRate = z; this.acquisitionTime = acquisitionTime;
    }
    public AngularVelocity(AngleUnit unit, float x, float y, float z, long acquisitionTime) { this(unit.getUnnormalized(), x, y, z, acquisitionTime); }
    public AngularVelocity toAngleUnit(AngleUnit u) {
        UnnormalizedAngleUnit n = u.getUnnormalized();
        return new AngularVelocity(n, n.fromUnit(unit, xRotationRate), n.fromUnit(unit, yRotationRate), n.fromUnit(unit, zRotationRate), acquisitionTime);
    }
    public AngularVelocity toAngleUnit(UnnormalizedAngleUnit n) {
        return new AngularVelocity(n, n.fromUnit(unit, xRotationRate), n.fromUnit(unit, yRotationRate), n.fromUnit(unit, zRotationRate), acquisitionTime);
    }
    @Override public String toString() { return String.format(Locale.US, "{x=%.3f, y=%.3f, z=%.3f}", xRotationRate, yRotationRate, zRotationRate); }
}
