package com.qualcomm.hardware.limelightvision;

import ftcsim.Json;
import ftcsim.Sim;
import org.firstinspires.ftc.robotcore.external.navigation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class LLResult {
    private final List<LLResultTypes.FiducialResult> fiducials = new ArrayList<LLResultTypes.FiducialResult>();
    private final int pipeline; private final long stamp;

    LLResult(Map<String, Object> m, int pipeline) {
        this.pipeline = pipeline; stamp = Sim.nanoTime();
        for (Object o : Json.arr(m.get("fiducials"))) {
            Map<String, Object> f = Json.obj(o);
            Pose3D p = new Pose3D(new Position(DistanceUnit.METER, Json.num(f.get("px"), 0), Json.num(f.get("py"), 0), Json.num(f.get("pz"), 0), stamp),
                    new YawPitchRollAngles(AngleUnit.DEGREES, Json.num(f.get("yaw"), 0), Json.num(f.get("pitch"), 0), Json.num(f.get("roll"), 0), stamp));
            fiducials.add(new LLResultTypes.FiducialResult((int) Json.num(f.get("id"), -1), Json.num(f.get("tx"), 0), Json.num(f.get("ty"), 0),
                    Json.num(f.get("ta"), 0), Json.num(f.get("txp"), 0), Json.num(f.get("typ"), 0), p));
        }
    }
    private LLResultTypes.FiducialResult best() {
        LLResultTypes.FiducialResult b = null;
        for (LLResultTypes.FiducialResult f : fiducials) if (b == null || f.getTargetArea() > b.getTargetArea()) b = f;
        return b;
    }
    public long getControlHubTimeStamp() { return stamp / 1000000L; }
    public long getControlHubTimeStampNanos() { return stamp; }
    public long getStaleness() { return 10; }
    public List<LLResultTypes.BarcodeResult> getBarcodeResults() { return new ArrayList<LLResultTypes.BarcodeResult>(); }
    public List<LLResultTypes.ClassifierResult> getClassifierResults() { return new ArrayList<LLResultTypes.ClassifierResult>(); }
    public List<LLResultTypes.DetectorResult> getDetectorResults() { return new ArrayList<LLResultTypes.DetectorResult>(); }
    public List<LLResultTypes.FiducialResult> getFiducialResults() { return fiducials; }
    public List<LLResultTypes.ColorResult> getColorResults() { return new ArrayList<LLResultTypes.ColorResult>(); }
    public double getFocusMetric() { return 0; }
    public Pose3D getBotpose() { return LLResultTypes.zero(); }
    public Pose3D getBotpose_MT2() { return LLResultTypes.zero(); }
    public double[] getStddevMt1() { return new double[6]; }
    public double[] getStddevMt2() { return new double[6]; }
    public int getBotposeTagCount() { return 0; }
    public double getBotposeSpan() { return 0; }
    public double getBotposeAvgDist() { return 0; }
    public double getBotposeAvgArea() { return 0; }
    public double[] getPythonOutput() { return new double[8]; }
    public double getCaptureLatency() { return 15; }
    public String getPipelineType() { return "pipe_fiducial"; }
    public double getTx() { LLResultTypes.FiducialResult b = best(); return b == null ? 0 : b.getTargetXDegrees(); }
    public double getTy() { LLResultTypes.FiducialResult b = best(); return b == null ? 0 : b.getTargetYDegrees(); }
    public double getTxNC() { return getTx(); }
    public double getTyNC() { return getTy(); }
    public double getTa() { LLResultTypes.FiducialResult b = best(); return b == null ? 0 : b.getTargetArea(); }
    public int getPipelineIndex() { return pipeline; }
    public double getTargetingLatency() { return 5; }
    public double getTimestamp() { return stamp * 1e-9; }
    public boolean isValid() { return !fiducials.isEmpty(); }
    public double getParseLatency() { return 0.1; }
    @Override public String toString() { return "LLResult{fiducials=" + fiducials.size() + ", tx=" + getTx() + ", ty=" + getTy() + "}"; }
}
