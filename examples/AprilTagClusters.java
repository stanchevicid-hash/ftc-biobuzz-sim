package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.apriltag.AprilTagClusterDetection;
import org.firstinspires.ftc.vision.apriltag.AprilTagDetection;
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;
import org.firstinspires.ftc.vision.apriltag.AprilTagSingleDetection;

import java.util.List;

/** SDK 12 AprilTag clusters (BIOBUZZ CELLS) and single tags. Drive around with gamepad1 to see the detections change. */
@TeleOp(name = "AprilTag Clusters", group = "Demo")
public class AprilTagClusters extends LinearOpMode {
    @Override
    public void runOpMode() {
        AprilTagProcessor aprilTag = AprilTagProcessor.easyCreateWithDefaults();
        VisionPortal portal = VisionPortal.easyCreateWithDefaults(hardwareMap.get(WebcamName.class, "Webcam 1"), aprilTag);
        waitForStart();
        while (opModeIsActive()) {
            List<AprilTagDetection> detections = aprilTag.getDetections();
            telemetry.addData("# detections", detections.size());
            for (AprilTagDetection detection : detections) {
                if (detection instanceof AprilTagSingleDetection) {
                    AprilTagSingleDetection s = (AprilTagSingleDetection) detection;
                    telemetry.addLine(String.format("tag %d  center (%.0f, %.0f) px", s.id, s.center.x, s.center.y));
                } else {
                    AprilTagClusterDetection c = (AprilTagClusterDetection) detection;
                    telemetry.addLine(String.format("CLUSTER %s  found %d%%", c.metadata.name, c.percentClusterFound));
                    telemetry.addLine(String.format("   XYZ %6.1f %6.1f %6.1f  (inch)", c.ftcPose.x, c.ftcPose.y, c.ftcPose.z));
                    telemetry.addLine(String.format("   PRY %6.1f %6.1f %6.1f  (deg)", c.ftcPose.pitch, c.ftcPose.roll, c.ftcPose.yaw));
                    telemetry.addLine(String.format("   RBE %6.1f %6.1f %6.1f  (inch, deg, deg)", c.ftcPose.range, c.ftcPose.bearing, c.ftcPose.elevation));
                }
            }
            // simple driving so the camera can be moved around
            double y = -gamepad1.left_stick_y, x = gamepad1.left_stick_x, rx = gamepad1.right_stick_x;
            double d = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1);
            hardwareMap.dcMotor.get("frontLeft").setPower(-(y + x + rx) / d * 0.5);
            hardwareMap.dcMotor.get("backLeft").setPower(-(y - x + rx) / d * 0.5);
            hardwareMap.dcMotor.get("frontRight").setPower((y - x - rx) / d * 0.5);
            hardwareMap.dcMotor.get("backRight").setPower((y + x - rx) / d * 0.5);
            telemetry.update();
        }
        portal.close();
    }
}
