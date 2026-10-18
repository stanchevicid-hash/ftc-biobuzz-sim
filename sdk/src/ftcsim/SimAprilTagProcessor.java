package ftcsim;

import android.graphics.Canvas;
import org.firstinspires.ftc.robotcore.external.matrices.GeneralMatrixF;
import org.firstinspires.ftc.robotcore.external.matrices.MatrixF;
import org.firstinspires.ftc.robotcore.external.navigation.*;
import org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration;
import org.firstinspires.ftc.vision.apriltag.*;
import org.opencv.core.Mat;
import org.opencv.core.Point;

import java.util.*;

/**
 * Builds AprilTag detections from the geometric visibility computed in the browser (per webcam):
 *   apriltag.<camera>.tags     = [{id, cx, cy, corners:[[x,y]...], x, y, z, R:[9]}]   raw pose, inches, OpenCV camera frame
 *   apriltag.<camera>.clusters = {firstId: {x, y, z, R:[9]}}                           pose of each cluster origin
 * ftcPose is derived from the raw pose exactly like the SDK (YXZ intrinsic decomposition).
 */
public class SimAprilTagProcessor extends AprilTagProcessor {
    private final AprilTagLibrary library;
    private final DistanceUnit du; private final AngleUnit au;
    private String camera = "Webcam 1"; private SimVisionPortal portal;
    private long lastFrame = -1;

    private final Mat4 robotInCamera;

    public SimAprilTagProcessor(AprilTagLibrary library, DistanceUnit du, AngleUnit au, TagFamily family, Position camPos, YawPitchRollAngles camOri) {
        this.library = library; this.du = du; this.au = au;
        // same construction as the SDK 12 Builder: camera pose given as yaw/pitch/roll = intrinsic ZXZ
        MatrixF r = new Orientation(AxesReference.INTRINSIC, AxesOrder.ZXZ, AngleUnit.DEGREES, (float) camOri.getYaw(AngleUnit.DEGREES),
                (float) camOri.getPitch(AngleUnit.DEGREES), (float) camOri.getRoll(AngleUnit.DEGREES), 0).getRotationMatrix();
        Position p = camPos.toUnit(DistanceUnit.INCH);
        robotInCamera = Mat4.translation(p.x, p.y, p.z).times(Mat4.rotation(r)).inverted();
    }

    /** SDK formula: robotInField = tagInField * inverse(tagInCamera) * robotInCamera */
    private Pose3D robotPose(AprilTagPoseRaw raw, org.firstinspires.ftc.robotcore.external.matrices.VectorF fieldPos, Quaternion fieldOri, DistanceUnit unit, long t) {
        if (fieldPos == null || fieldOri == null) return null;
        double k = DistanceUnit.INCH.fromUnit(unit, 1);
        Mat4 tagInField = Mat4.translation(k * fieldPos.get(0), k * fieldPos.get(1), k * fieldPos.get(2)).times(Mat4.rotation(fieldOri.toMatrix()));
        Mat4 tagInCamera = Mat4.translation(DistanceUnit.INCH.fromUnit(du, raw.x), DistanceUnit.INCH.fromUnit(du, raw.y), DistanceUnit.INCH.fromUnit(du, raw.z)).times(Mat4.rotation(raw.R));
        Mat4 robot = tagInField.times(tagInCamera.inverted()).times(robotInCamera);
        Orientation o = Orientation.getOrientation(robot.rot(), AxesReference.INTRINSIC, AxesOrder.ZXY, au);
        Position pos = new Position(DistanceUnit.INCH, robot.tx(), robot.ty(), robot.tz(), t).toUnit(du);
        return new Pose3D(pos, new YawPitchRollAngles(au, o.firstAngle, o.secondAngle, o.thirdAngle, t));
    }

    @Override public void simBind(String cameraName, Object portal, int w, int h) { camera = cameraName; this.portal = (SimVisionPortal) portal; }
    @Override public void init(int width, int height, CameraCalibration calibration) {}
    @Override public Object processFrame(Mat frame, long captureTimeNanos) { return null; }
    @Override public void onDrawFrame(Canvas c, int w, int h, float s1, float s2, Object u) {}
    @Override public void setDecimation(float decimation) {}
    @Override public void setPoseSolver(PoseSolver poseSolver) {}
    @Override public int getPerTagAvgPoseSolveTime() { return 2; }

    private AprilTagPoseRaw raw(Map<String, Object> m) {
        List<Object> r = Json.arr(m.get("R"));
        double[][] R = new double[3][3];
        for (int i = 0; i < 9 && i < r.size(); i++) R[i / 3][i % 3] = Json.num(r.get(i), 0);
        return new AprilTagPoseRaw(du.fromInches(Json.num(m.get("x"), 0)), du.fromInches(Json.num(m.get("y"), 0)), du.fromInches(Json.num(m.get("z"), 0)), GeneralMatrixF.of(R));
    }
    private AprilTagPoseFtc ftc(AprilTagPoseRaw p) {
        Orientation rot = Orientation.getOrientation(p.R, AxesReference.INTRINSIC, AxesOrder.YXZ, au);
        return new AprilTagPoseFtc(p.x, p.z, -p.y, -rot.firstAngle, rot.secondAngle, rot.thirdAngle, Math.hypot(p.x, p.z),
                au.fromUnit(AngleUnit.RADIANS, Math.atan2(-p.x, p.z)), au.fromUnit(AngleUnit.RADIANS, Math.atan2(-p.y, p.z)));
    }

    @Override public ArrayList<AprilTagDetection> getDetections() {
        ArrayList<AprilTagDetection> out = new ArrayList<AprilTagDetection>();
        if (portal != null && !portal.simActive(this)) return out;
        Map<String, Object> cam = Json.obj(Json.obj(Sim.sensors.get("apriltag")).get(camera));
        long t = Sim.nanoTime();
        Map<AprilTagClusterMetadata, Integer> seen = new LinkedHashMap<AprilTagClusterMetadata, Integer>();
        for (Object o : Json.arr(cam.get("tags"))) {
            Map<String, Object> m = Json.obj(o);
            int id = (int) Json.num(m.get("id"), -1);
            AprilTagClusterMetadata cl = library.lookupCluster(id);
            if (cl != null) { Integer n = seen.get(cl); seen.put(cl, n == null ? 1 : n + 1); continue; }
            List<Object> cs = Json.arr(m.get("corners"));
            Point[] corners = new Point[cs.size()];
            for (int i = 0; i < corners.length; i++) { List<Object> c = Json.arr(cs.get(i)); corners[i] = new Point(Json.num(c.get(0), 0), Json.num(c.get(1), 0)); }
            AprilTagMetadata md = library.lookupTag(id);
            AprilTagPoseRaw rp = md != null ? raw(m) : null;   // like the SDK: no pose for tags missing from the library
            out.add(new AprilTagSingleDetection(id, 0, (float) Json.num(m.get("margin"), 60), new Point(Json.num(m.get("cx"), 0), Json.num(m.get("cy"), 0)),
                    corners, md, rp != null ? ftc(rp) : null, rp, rp != null ? robotPose(rp, md.fieldPosition, md.fieldOrientation, md.distanceUnit, t) : null, t, du));
        }
        Map<String, Object> clusters = Json.obj(cam.get("clusters"));
        for (Map.Entry<AprilTagClusterMetadata, Integer> e : seen.entrySet()) {
            for (Map.Entry<String, Object> c : clusters.entrySet()) {
                int first = (int) Double.parseDouble(c.getKey());
                if (!e.getKey().simContains(first)) continue;
                AprilTagPoseRaw rp = raw(Json.obj(c.getValue()));
                int pct = Math.round(e.getValue() * 100f / e.getKey().simMemberCount());
                AprilTagClusterMetadata cm = e.getKey();
                out.add(new AprilTagClusterDetection(pct, cm, du, ftc(rp), rp, robotPose(rp, cm.fieldPosition, cm.fieldOrientation, cm.distanceUnit, t), t));
                break;
            }
        }
        lastFrame = t;
        return out;
    }
    @Override public ArrayList<AprilTagDetection> getFreshDetections() {
        long t = Sim.nanoTime();
        if (t == lastFrame) return null;
        return getDetections();
    }
}
