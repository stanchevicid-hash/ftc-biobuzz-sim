package com.qualcomm.robotcore.eventloop.opmode;

public interface OpModeManager {
    void register(String name, Class<? extends OpMode> opModeClass);
    void register(String name, OpMode opModeInstance);
}
