package org.firstinspires.ftc.robotcore.external.hardware.camera.controls;

public interface GainControl extends CameraControl {
    int getMinGain();
    int getMaxGain();
    int getGain();
    boolean setGain(int gain);
}
