package ftcsim;

import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;

public class SimWebcam extends SimDevice implements WebcamName {
    public SimWebcam(String name) { super(name); }
    public boolean isWebcam() { return true; }
    public boolean isCameraDirection() { return false; }
    public boolean isSwitchable() { return false; }
    public boolean isUnknown() { return false; }
    public boolean isAttached() { return true; }
    @Override public String getDeviceName() { return "Webcam (sim): " + name; }
}
