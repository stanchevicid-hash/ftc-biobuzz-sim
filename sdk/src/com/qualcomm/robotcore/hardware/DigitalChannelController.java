package com.qualcomm.robotcore.hardware;

public interface DigitalChannelController extends HardwareDevice {
    enum Mode { INPUT, OUTPUT;
        public DigitalChannel.Mode migrate() { return this == INPUT ? DigitalChannel.Mode.INPUT : DigitalChannel.Mode.OUTPUT; } }
}
