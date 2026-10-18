package com.qualcomm.robotcore.hardware;

public class CRServoImplEx extends CRServoImpl implements PwmControl {
    protected PwmRange range = PwmRange.defaultRange;
    public CRServoImplEx(String name, int port) { super(name, port); }
    @Override public void setPwmRange(PwmRange r) { range = r; }
    @Override public PwmRange getPwmRange() { return range; }
    @Override public void setPwmEnable() { pwmEnabled = true; }
    @Override public void setPwmDisable() { pwmEnabled = false; }
    @Override public boolean isPwmEnabled() { return pwmEnabled; }
    @Override public void setPulseWidth(double us) { setPower(((us - range.usPulseLower) / (range.usPulseUpper - range.usPulseLower)) * 2 - 1); }
    @Override public double getPulseWidth() { return range.usPulseLower + (getPower() + 1) / 2 * (range.usPulseUpper - range.usPulseLower); }
}
