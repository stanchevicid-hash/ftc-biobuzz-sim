package com.qualcomm.robotcore.hardware;

public class ServoImplEx extends ServoImpl implements PwmControl {
    protected PwmRange range = PwmRange.defaultRange;

    public ServoImplEx(String name, int port) { super(name, port); }

    @Override public void setPwmRange(PwmRange r) { range = r; }
    @Override public PwmRange getPwmRange() { return range; }
    @Override public void setPwmEnable() { pwmEnabled = true; }
    @Override public void setPwmDisable() { pwmEnabled = false; }
    @Override public boolean isPwmEnabled() { return pwmEnabled; }
    @Override public void setPulseWidth(double us) {
        setPosition((us - range.usPulseLower) / (range.usPulseUpper - range.usPulseLower));
    }
    @Override public double getPulseWidth() { return range.usPulseLower + getPosition() * (range.usPulseUpper - range.usPulseLower); }
}
