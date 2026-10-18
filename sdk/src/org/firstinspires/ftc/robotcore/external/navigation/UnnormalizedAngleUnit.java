package org.firstinspires.ftc.robotcore.external.navigation;

public enum UnnormalizedAngleUnit {
    DEGREES(0), RADIANS(1);
    public final byte bVal;
    UnnormalizedAngleUnit(int i) { bVal = (byte) i; }
    public double fromDegrees(double d) { return this == RADIANS ? Math.toRadians(d) : d; }
    public float fromDegrees(float d) { return (float) fromDegrees((double) d); }
    public double fromRadians(double r) { return this == RADIANS ? r : Math.toDegrees(r); }
    public float fromRadians(float r) { return (float) fromRadians((double) r); }
    public double fromUnit(UnnormalizedAngleUnit them, double theirs) { return them == RADIANS ? fromRadians(theirs) : fromDegrees(theirs); }
    public float fromUnit(UnnormalizedAngleUnit them, float theirs) { return (float) fromUnit(them, (double) theirs); }
    public double fromUnit(AngleUnit them, double theirs) { return them == AngleUnit.RADIANS ? fromRadians(theirs) : fromDegrees(theirs); }
    public double toDegrees(double v) { return this == DEGREES ? v : Math.toDegrees(v); }
    public float toDegrees(float v) { return (float) toDegrees((double) v); }
    public double toRadians(double v) { return this == RADIANS ? v : Math.toRadians(v); }
    public float toRadians(float v) { return (float) toRadians((double) v); }
    public AngleUnit getNormalized() { return this == DEGREES ? AngleUnit.DEGREES : AngleUnit.RADIANS; }
}
