package org.firstinspires.ftc.robotcore.external.hardware.camera;

import com.qualcomm.robotcore.hardware.HardwareDevice;

public interface WebcamName extends CameraName, HardwareDevice {
    boolean isAttached();
}
