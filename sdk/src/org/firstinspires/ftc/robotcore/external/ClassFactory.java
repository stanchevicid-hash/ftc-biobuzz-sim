package org.firstinspires.ftc.robotcore.external;

import org.firstinspires.ftc.robotcore.external.hardware.camera.CameraManager;
import org.firstinspires.ftc.robotcore.external.hardware.camera.CameraName;
import org.firstinspires.ftc.robotcore.external.hardware.camera.SwitchableCameraName;

public class ClassFactory {
    private static final ClassFactory instance = new ClassFactory();
    public static ClassFactory getInstance() { return instance; }
    public CameraManager getCameraManager() {
        return new CameraManager() {
            public CameraName nameForSwitchableCamera(final CameraName... members) {
                return new SwitchableCameraName() {
                    public CameraName[] getMembers() { return members; }
                    public boolean allMembersAreWebcams() { return true; }
                    public boolean isWebcam() { return false; }
                    public boolean isCameraDirection() { return false; }
                    public boolean isSwitchable() { return true; }
                    public boolean isUnknown() { return false; }
                };
            }
        };
    }
}
