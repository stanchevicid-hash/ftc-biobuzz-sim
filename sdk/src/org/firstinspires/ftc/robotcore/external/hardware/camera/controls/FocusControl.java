package org.firstinspires.ftc.robotcore.external.hardware.camera.controls;

public interface FocusControl extends CameraControl {
    enum Mode { Unknown, Auto, ContinuousAuto, Macro, Infinity, Fixed }
    Mode getMode();
    boolean setMode(Mode mode);
    boolean isModeSupported(Mode mode);
    double getMinFocusLength();
    double getMaxFocusLength();
    double getFocusLength();
    boolean setFocusLength(double focusLength);
    boolean isFocusLengthSupported();
}
