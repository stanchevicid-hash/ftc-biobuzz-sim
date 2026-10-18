package org.firstinspires.ftc.vision;

import android.util.Size;
import ftcsim.SimVisionPortal;
import org.firstinspires.ftc.robotcore.external.hardware.camera.BuiltinCameraDirection;
import org.firstinspires.ftc.robotcore.external.hardware.camera.CameraName;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.robotcore.external.hardware.camera.controls.CameraControl;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public abstract class VisionPortal {
    public static final int DEFAULT_VIEW_CONTAINER_ID = 0;
    public enum MultiPortalLayout { VERTICAL, HORIZONTAL }
    public enum CameraState { OPENING_CAMERA_DEVICE, CAMERA_DEVICE_READY, STARTING_STREAM, STREAMING, STOPPING_STREAM, CLOSING_CAMERA_DEVICE, CAMERA_DEVICE_CLOSED, ERROR }
    public enum StreamFormat { YUY2, MJPEG }

    public static int[] makeMultiPortalView(int numPortals, MultiPortalLayout mpl) { int[] r = new int[numPortals]; for (int i = 0; i < numPortals; i++) r[i] = i + 1; return r; }
    public static VisionPortal easyCreateWithDefaults(BuiltinCameraDirection cameraDirection, VisionProcessor... processors) {
        return new Builder().setCamera(cameraDirection).addProcessors(processors).build();
    }
    public static VisionPortal easyCreateWithDefaults(CameraName cameraName, VisionProcessor... processors) {
        return new Builder().setCamera(cameraName).addProcessors(processors).build();
    }

    public abstract void setProcessorEnabled(VisionProcessor processor, boolean enabled);
    public abstract boolean getProcessorEnabled(VisionProcessor processor);
    public abstract CameraState getCameraState();
    public abstract void saveNextFrameRaw(String filename);
    public abstract void stopStreaming();
    public abstract void resumeStreaming();
    public abstract void stopLiveView();
    public abstract void resumeLiveView();
    public abstract float getFps();
    public abstract <T extends CameraControl> T getCameraControl(Class<T> controlType);
    public abstract void setActiveCamera(WebcamName webcamName);
    public abstract WebcamName getActiveCamera();
    public abstract void close();

    public static class Builder {
        private CameraName camera; private BuiltinCameraDirection direction;
        private Size resolution = new Size(640, 480);
        private final List<VisionProcessor> processors = new ArrayList<VisionProcessor>();
        public Builder setCamera(CameraName camera) { this.camera = camera; return this; }
        public Builder setCamera(BuiltinCameraDirection cameraDirection) { this.direction = cameraDirection; return this; }
        public Builder setStreamFormat(StreamFormat streamFormat) { return this; }
        public Builder enableLiveView(boolean enableLiveView) { return this; }
        public Builder setAutoStopLiveView(boolean autoPause) { return this; }
        public Builder setLiveViewContainerId(int liveViewContainerId) { return this; }
        public Builder setCameraResolution(Size cameraResolution) { resolution = cameraResolution; return this; }
        public Builder addProcessor(VisionProcessor processor) { processors.add(processor); return this; }
        public Builder addProcessors(VisionProcessor... ps) { processors.addAll(Arrays.asList(ps)); return this; }
        public Builder setAutoStartStreamOnBuild(boolean autoStartStreamOnBuild) { return this; }
        public Builder setShowStatsOverlay(boolean showStatsOverlay) { return this; }
        public VisionPortal build() {
            if (camera == null && direction == null) throw new IllegalStateException("You must set a camera!");
            return new SimVisionPortal(camera, resolution, processors);
        }
    }
}
