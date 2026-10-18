package org.firstinspires.ftc.robotcore.external.hardware.camera;

public interface SwitchableCameraName extends CameraName {
    CameraName[] getMembers();
    boolean allMembersAreWebcams();
}
