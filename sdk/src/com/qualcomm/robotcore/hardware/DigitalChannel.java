package com.qualcomm.robotcore.hardware;

public interface DigitalChannel extends HardwareDevice {
    enum Mode { INPUT, OUTPUT }
    Mode getMode();
    void setMode(Mode mode);
    boolean getState();
    void setState(boolean state);
    @Deprecated void setMode(DigitalChannelController.Mode mode);
}
