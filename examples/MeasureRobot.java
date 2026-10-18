package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.VoltageSensor;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;

/**
 * Run this on the REAL robot to get the numbers for the simulator's Calibration tab.
 * Put the robot on field tiles with about 8 ft of free space in front and to the right, battery charged.
 *
 *   A          forward at full power for 1.5 s, shows the top speed from the encoders
 *   B / X      strafe right at full power for 1.0 s / 2.0 s, then brake. Measure both distances with a tape:
 *              strafe speed = (distance after 2 s - distance after 1 s) per second. Speeding up and braking cancel out.
 *   Y          turn left at power 0.5, shows how long a full 360 degrees takes (IMU)
 *   dpad up    drives exactly ENCODER_TEST_TICKS forward. Measure the distance: enter both in Calibration.
 *
 * Change the names, directions, encoder and wheel values below to match your robot.
 */
@TeleOp(name = "Measure robot", group = "Calibration")
public class MeasureRobot extends LinearOpMode {
    static final String FL = "frontLeft", FR = "frontRight", BL = "backLeft", BR = "backRight";
    static final double TICKS_PER_REV = 537.7;      // goBILDA 5203 312 RPM
    static final double WHEEL_DIAMETER_IN = 104 / 25.4;
    static final int ENCODER_TEST_TICKS = 2000;

    DcMotorEx fl, fr, bl, br;

    @Override
    public void runOpMode() {
        fl = hardwareMap.get(DcMotorEx.class, FL);
        fr = hardwareMap.get(DcMotorEx.class, FR);
        bl = hardwareMap.get(DcMotorEx.class, BL);
        br = hardwareMap.get(DcMotorEx.class, BR);
        fl.setDirection(DcMotorSimple.Direction.REVERSE);
        bl.setDirection(DcMotorSimple.Direction.REVERSE);
        for (DcMotorEx m : all()) { m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE); m.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER); m.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER); }
        IMU imu = hardwareMap.get(IMU.class, "imu");
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(
                RevHubOrientationOnRobot.LogoFacingDirection.UP, RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));
        VoltageSensor battery = hardwareMap.voltageSensor.iterator().next();

        String result = "Press A, B, X, Y or dpad up.";
        telemetry.addLine("Clear 8 ft in front and to the right, then press START.");
        telemetry.update();
        waitForStart();

        while (opModeIsActive()) {
            if (gamepad1.aWasPressed()) {
                double v = 0, volts = battery.getVoltage();
                ElapsedTime t = new ElapsedTime();
                drive(1, 0, 0);
                while (opModeIsActive() && t.seconds() < 1.5) {
                    double tps = 0; for (DcMotorEx m : all()) tps += Math.abs(m.getVelocity()) / 4;
                    v = Math.max(v, tps / TICKS_PER_REV * Math.PI * WHEEL_DIAMETER_IN);
                }
                drive(0, 0, 0);
                result = String.format("Forward speed at power 1.0: %.1f in/s (battery %.2f V)", v, volts);
            } else if (gamepad1.bWasPressed() || gamepad1.xWasPressed()) {
                double seconds = gamepad1.x ? 2.0 : 1.0;
                timed(0, 1, 0, seconds);
                result = String.format("Strafed %.0f s. Measure the distance. Speed = d(2 s) - d(1 s), in in/s.", seconds);
            } else if (gamepad1.yWasPressed()) {
                imu.resetYaw();
                double turned = 0, last = 0;
                ElapsedTime t = new ElapsedTime();
                drive(0, 0, 0.5);
                while (opModeIsActive() && turned < 360 && t.seconds() < 10) {
                    double yaw = imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES), d = yaw - last;
                    if (d < -180) d += 360; if (d > 180) d -= 360;
                    turned += d; last = yaw;
                }
                drive(0, 0, 0);
                result = turned >= 360 ? String.format("Full turn at power 0.5: %.2f s", t.seconds()) : "Did not finish a turn in 10 s";
            } else if (gamepad1.dpadUpWasPressed()) {
                for (DcMotorEx m : all()) { m.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER); m.setTargetPosition(ENCODER_TEST_TICKS); m.setMode(DcMotor.RunMode.RUN_TO_POSITION); m.setPower(0.5); }
                while (opModeIsActive() && (fl.isBusy() || fr.isBusy() || bl.isBusy() || br.isBusy())) idle();
                for (DcMotorEx m : all()) { m.setPower(0); m.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER); }
                result = "Drove " + ENCODER_TEST_TICKS + " ticks. Measure the distance in inches.";
            }
            telemetry.addLine(result);
            telemetry.addData("Battery", "%.2f V", battery.getVoltage());
            telemetry.update();
        }
    }

    DcMotorEx[] all() { return new DcMotorEx[]{fl, fr, bl, br}; }

    /** mecanum: forward, strafe right, turn left */
    void drive(double y, double x, double turn) {
        fl.setPower(y + x - turn); fr.setPower(y - x + turn);
        bl.setPower(y - x - turn); br.setPower(y + x + turn);
    }

    void timed(double y, double x, double turn, double seconds) {
        ElapsedTime t = new ElapsedTime();
        drive(y, x, turn);
        while (opModeIsActive() && t.seconds() < seconds) idle();
        drive(0, 0, 0);
        sleep(500);
    }
}
