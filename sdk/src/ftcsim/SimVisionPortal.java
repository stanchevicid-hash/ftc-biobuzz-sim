package ftcsim;

import android.util.Size;
import org.firstinspires.ftc.robotcore.external.hardware.camera.CameraName;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.robotcore.external.hardware.camera.controls.*;
import org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.VisionProcessor;
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;

import java.util.*;
import java.util.concurrent.TimeUnit;

/** The camera image is not decoded: the browser computes what each webcam can see and the processors read that. */
public class SimVisionPortal extends VisionPortal {
    private final Map<VisionProcessor, Boolean> enabled = new LinkedHashMap<VisionProcessor, Boolean>();
    private WebcamName camera;
    private volatile boolean streaming = true;
    private ExposureControl.Mode exposureMode = ExposureControl.Mode.Auto;
    private long exposureMs = 15; private int gain = 100;

    public SimVisionPortal(CameraName cam, Size resolution, List<VisionProcessor> processors) {
        if (cam instanceof org.firstinspires.ftc.robotcore.external.hardware.camera.SwitchableCameraName)
            cam = ((org.firstinspires.ftc.robotcore.external.hardware.camera.SwitchableCameraName) cam).getMembers()[0];
        if (cam instanceof WebcamName) camera = (WebcamName) cam;
        String camName = cam instanceof SimWebcam ? ((SimWebcam) cam).simName() : firstWebcam();
        this.width = resolution.getWidth(); this.height = resolution.getHeight();
        for (VisionProcessor p : processors) {
            enabled.put(p, true);
            p.init(resolution.getWidth(), resolution.getHeight(), new CameraCalibration());
            if (p instanceof AprilTagProcessor) ((AprilTagProcessor) p).simBind(camName, this, resolution.getWidth(), resolution.getHeight());
        }
    }
    private static String firstWebcam() { Map<String, Object> c = Json.obj(Sim.sensors.get("cameras")); return c.isEmpty() ? "Webcam 1" : c.keySet().iterator().next(); }
    public boolean simActive(VisionProcessor p) { Boolean e = enabled.get(p); return streaming && e != null && e; }

    @Override public void setProcessorEnabled(VisionProcessor p, boolean e) { enabled.put(p, e); }
    @Override public boolean getProcessorEnabled(VisionProcessor p) { Boolean e = enabled.get(p); return e != null && e; }
    @Override public CameraState getCameraState() { return streaming ? CameraState.STREAMING : CameraState.CAMERA_DEVICE_READY; }
    @Override public void saveNextFrameRaw(String filename) {}
    @Override public void stopStreaming() { streaming = false; }
    @Override public void resumeStreaming() { streaming = true; }
    @Override public void stopLiveView() {}
    @Override public void resumeLiveView() {}
    @Override public float getFps() { return streaming ? 30f : 0f; }
    @Override @SuppressWarnings("unchecked") public <T extends CameraControl> T getCameraControl(Class<T> type) {
        if (type == ExposureControl.class) return (T) new ExposureControl() {
            public Mode getMode() { return exposureMode; }
            public boolean setMode(Mode m) { exposureMode = m; return true; }
            public boolean isModeSupported(Mode m) { return m == Mode.Auto || m == Mode.Manual; }
            public long getMinExposure(TimeUnit u) { return u.convert(1, TimeUnit.MILLISECONDS); }
            public long getMaxExposure(TimeUnit u) { return u.convert(204, TimeUnit.MILLISECONDS); }
            public long getExposure(TimeUnit u) { return u.convert(exposureMs, TimeUnit.MILLISECONDS); }
            public boolean setExposure(long d, TimeUnit u) { exposureMs = TimeUnit.MILLISECONDS.convert(d, u); return true; }
            public boolean isExposureSupported() { return true; }
            public boolean getAePriority() { return false; }
            public boolean setAePriority(boolean p) { return true; }
        };
        if (type == GainControl.class) return (T) new GainControl() {
            public int getMinGain() { return 0; }
            public int getMaxGain() { return 255; }
            public int getGain() { return gain; }
            public boolean setGain(int g) { gain = g; return true; }
        };
        return null;
    }
    private int width, height;
    @Override public void setActiveCamera(WebcamName w) {
        camera = w;
        if (w instanceof SimWebcam)
            for (VisionProcessor p : enabled.keySet())
                if (p instanceof AprilTagProcessor) ((AprilTagProcessor) p).simBind(((SimWebcam) w).simName(), this, width, height);
    }
    @Override public WebcamName getActiveCamera() { return camera; }
    @Override public void close() { streaming = false; }
}
