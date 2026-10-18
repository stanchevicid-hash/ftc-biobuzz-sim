package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.util.ElapsedTime;
import com.qualcomm.robotcore.util.Range;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.apriltag.AprilTagClusterDetection;
import org.firstinspires.ftc.vision.apriltag.AprilTagDetection;
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;

/**
 * Autonomous for the demo robot, start "Red - audience side" (touching the red wall, facing the blue wall).
 *  1. encoder drive (RUN_TO_POSITION) to the shooting spot in front of the raised red CELL
 *  2. IMU turn to face the HIVE
 *  3. AprilTag cluster (SDK 12 clusters) to square up on the CELL
 *  4. shoot the 4 preloaded POLLEN -> HIVE TIP (20 pts)
 *  5. drive into the red LOADING ZONE -> LEAVE (3) + AUTO PARK (5)
 */
@Autonomous(name = "Demo Auto: Red audience", group = "Demo", preselectTeleOp = "Demo TeleOp")
public class DemoAutoRedAudience extends LinearOpMode {
    static final double TICKS_PER_REV = 537.7;                    // goBILDA 5203 312 rpm
    static final double WHEEL_DIAMETER_IN = 104 / 25.4;           // goBILDA 104 mm mecanum
    static final double TICKS_PER_IN = TICKS_PER_REV / (Math.PI * WHEEL_DIAMETER_IN);
    static final double STRAFE_CORRECTION = 1.0;                  // tune on the real robot (often 1.05-1.2: rollers slip sideways)
    static final double SHOOTER_RPM = 2200, SHOOTER_TPR = 28;   // found with the simulator: tips the HIVE from 50..59 in
    static final double HOOD = 0.90;

    DcMotor fl, fr, bl, br;
    DcMotorEx shooter;
    Servo feeder, hood;
    IMU imu;
    AprilTagProcessor aprilTag;
    VisionPortal portal;
    ElapsedTime match = new ElapsedTime();

    @Override
    public void runOpMode() {
        fl = hardwareMap.get(DcMotor.class, "frontLeft");
        fr = hardwareMap.get(DcMotor.class, "frontRight");
        bl = hardwareMap.get(DcMotor.class, "backLeft");
        br = hardwareMap.get(DcMotor.class, "backRight");
        fl.setDirection(DcMotorSimple.Direction.REVERSE);
        bl.setDirection(DcMotorSimple.Direction.REVERSE);
        for (DcMotor m : new DcMotor[]{fl, fr, bl, br}) {
            m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
            m.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        }
        shooter = hardwareMap.get(DcMotorEx.class, "shooter");
        shooter.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        feeder = hardwareMap.get(Servo.class, "feeder");
        hood = hardwareMap.get(Servo.class, "hood");
        imu = hardwareMap.get(IMU.class, "imu");
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(
                RevHubOrientationOnRobot.LogoFacingDirection.UP, RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));
        aprilTag = new AprilTagProcessor.Builder().build();
        portal = new VisionPortal.Builder()
                .setCamera(hardwareMap.get(WebcamName.class, "Webcam 1"))
                .addProcessor(aprilTag)
                .build();
        feeder.setPosition(0);
        hood.setPosition(HOOD);

        telemetry.addLine("Initialized. Start: red audience side, facing the blue wall.");
        telemetry.update();
        waitForStart();
        match.reset();
        imu.resetYaw();

        shooter.setVelocity(SHOOTER_RPM / 60 * SHOOTER_TPR);      // spin up early
        drive(50.25, 0, 0.7);                                       // forward (towards the blue wall)
        drive(0, 19.1, 0.6);                                        // strafe right (towards the audience)
        turnTo(90, 0.5);                                            // face the HIVE (+X)
        alignOnCluster("RED AUDIENCE", 2.0);
        shoot(4);
        shooter.setPower(0);
        turnTo(90, 0.5);
        drive(91, 0, 0.8);                                          // under the HIVE towards the far wall
        drive(0, -47, 0.7);                                         // strafe left into the red LOADING ZONE

        telemetry.addData("Auto finished at", "%.1f s", match.seconds());
        telemetry.update();
        while (opModeIsActive()) idle();
    }

    /** robot-centric move in inches: forward (+) / right (+) with RUN_TO_POSITION */
    void drive(double forwardIn, double rightIn, double power) {
        int f = (int) Math.round(forwardIn * TICKS_PER_IN), r = (int) Math.round(rightIn * TICKS_PER_IN * STRAFE_CORRECTION);
        DcMotor[] ms = {fl, fr, bl, br};
        int[] d = {f + r, f - r, f - r, f + r};
        for (int i = 0; i < 4; i++) {
            ms[i].setTargetPosition(ms[i].getCurrentPosition() + d[i]);
            ms[i].setMode(DcMotor.RunMode.RUN_TO_POSITION);
            ms[i].setPower(power);
        }
        while (opModeIsActive() && (fl.isBusy() || fr.isBusy() || bl.isBusy() || br.isBusy())) {
            telemetry.addData("Step", "drive f=%.1f r=%.1f", forwardIn, rightIn);
            telemetry.addData("Encoders", "%d %d %d %d", fl.getCurrentPosition(), fr.getCurrentPosition(), bl.getCurrentPosition(), br.getCurrentPosition());
            telemetry.addData("Time", "%.1f", match.seconds());
            telemetry.update();
        }
        for (DcMotor m : ms) { m.setPower(0); m.setMode(DcMotor.RunMode.RUN_USING_ENCODER); }
    }

    void setTurn(double p) { fl.setPower(-p); bl.setPower(-p); fr.setPower(p); br.setPower(p); }

    /** turn to an IMU heading (degrees, CCW +) with a P controller */
    void turnTo(double target, double maxPower) {
        ElapsedTime t = new ElapsedTime();
        while (opModeIsActive() && t.seconds() < 3) {
            double err = AngleUnit.normalizeDegrees(target - imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES));
            if (Math.abs(err) < 1.0) break;
            setTurn(Range.clip(err * 0.025, -maxPower, maxPower) + Math.signum(err) * 0.06);
            telemetry.addData("Step", "turn to %.0f, error %.1f", target, err);
            telemetry.update();
        }
        setTurn(0);
    }

    /** rotate until the AprilTag cluster is straight ahead (bearing ~ 0) */
    void alignOnCluster(String name, double timeoutS) {
        ElapsedTime t = new ElapsedTime();
        while (opModeIsActive() && t.seconds() < timeoutS) {
            AprilTagClusterDetection target = null;
            for (AprilTagDetection d : aprilTag.getDetections())
                if (d instanceof AprilTagClusterDetection && ((AprilTagClusterDetection) d).metadata.name.equals(name)) target = (AprilTagClusterDetection) d;
            if (target == null) { setTurn(0); telemetry.addLine("cluster not visible"); telemetry.update(); continue; }
            double bearing = target.ftcPose.bearing;
            telemetry.addData("Cluster", "%s %d%% range %.1f in bearing %.1f deg", name, target.percentClusterFound, target.ftcPose.range, bearing);
            telemetry.update();
            if (Math.abs(bearing) < 0.7) break;
            setTurn(Range.clip(bearing * 0.03, -0.25, 0.25) + Math.signum(bearing) * 0.05);
        }
        setTurn(0);
    }

    void shoot(int n) {
        double target = SHOOTER_RPM / 60 * SHOOTER_TPR;
        for (int i = 0; i < n && opModeIsActive(); i++) {
            // feed only when the flywheel is back at speed: consistent shots
            ElapsedTime t = new ElapsedTime();
            while (opModeIsActive() && Math.abs(shooter.getVelocity() - target) > target * 0.02 && t.seconds() < 2) {
                telemetry.addData("Shooter", "%.0f / %.0f rpm", shooter.getVelocity() / SHOOTER_TPR * 60, SHOOTER_RPM);
                telemetry.update();
            }
            feeder.setPosition(1.0);
            sleep(250);
            feeder.setPosition(0.0);
            sleep(150);
            telemetry.addData("Shots", i + 1);
            telemetry.update();
        }
    }
}
