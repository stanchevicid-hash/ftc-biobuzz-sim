package org.firstinspires.ftc.robotcore.external.hardware.camera;

/** Camera quirks are meaningless in the simulator; accepted and ignored. */
public class CameraCompatibilityManager {
    public enum Quirk { AVOID_LIB_USB_RESET_DEVICE, FORCE_YUY2, DISABLE_MJPEG }
    private static final CameraCompatibilityManager instance = new CameraCompatibilityManager();
    public static CameraCompatibilityManager getInstance() { return instance; }
    public CameraCompatibilityManager addQuirk(int vendorId, int productId, Quirk quirk) { return this; }
    public boolean hasQuirk(int vendorId, int productId, Quirk quirk) { return false; }
}
