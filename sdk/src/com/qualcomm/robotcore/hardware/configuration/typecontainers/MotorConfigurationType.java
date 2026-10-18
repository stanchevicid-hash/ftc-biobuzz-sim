package com.qualcomm.robotcore.hardware.configuration.typecontainers;

public final class MotorConfigurationType implements Cloneable {
    private String name = "Unspecified";
    private double ticksPerRev = 28, gearing = 1, maxRPM = 6000, achieveableMaxRPMFraction = 0.85;

    public MotorConfigurationType() {}
    public MotorConfigurationType(String name, double ticksPerRev, double maxRPM, double gearing) {
        this.name = name; this.ticksPerRev = ticksPerRev; this.maxRPM = maxRPM; this.gearing = gearing;
    }
    public String getName() { return name; }
    public double getTicksPerRev() { return ticksPerRev; }
    public double getAchieveableMaxTicksPerSecond() { return ticksPerRev * maxRPM * achieveableMaxRPMFraction / 60.0; }
    public int getAchieveableMaxTicksPerSecondRounded() { return (int) Math.round(getAchieveableMaxTicksPerSecond()); }
    public void setTicksPerRev(double ticksPerRev) { this.ticksPerRev = ticksPerRev; }
    public double getGearing() { return gearing; }
    public void setGearing(double gearing) { this.gearing = gearing; }
    public double getMaxRPM() { return maxRPM; }
    public void setMaxRPM(double maxRPM) { this.maxRPM = maxRPM; }
    public double getAchieveableMaxRPMFraction() { return achieveableMaxRPMFraction; }
    public void setAchieveableMaxRPMFraction(double f) { achieveableMaxRPMFraction = f; }
    public static MotorConfigurationType getUnspecifiedMotorType() { return new MotorConfigurationType(); }
    @Override public MotorConfigurationType clone() {
        try { return (MotorConfigurationType) super.clone(); } catch (CloneNotSupportedException e) { throw new RuntimeException(e); }
    }
    @Override public String toString() { return name; }
}
