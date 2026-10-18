package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.Servo;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;

/**
 * TeleOp for the demo robot (works unchanged on a real Strafer with the same configuration names).
 *  gamepad1: left stick = drive, right stick X = turn, LB = slow mode, BACK = reset field-centric heading,
 *            Y = toggle field-centric
 *  gamepad2 (or gamepad1 when alone): RT = intake, LT = reverse intake, A = spin up shooter, B = feed one ball,
 *            dpad up/down = hood, right stick Y = lift, X = claw toggle
 */
@TeleOp(name = "Demo TeleOp", group = "Demo")
public class DemoTeleOp extends LinearOpMode {
    @Override
    public void runOpMode() {
        DcMotor fl = hardwareMap.get(DcMotor.class, "frontLeft");
        DcMotor fr = hardwareMap.get(DcMotor.class, "frontRight");
        DcMotor bl = hardwareMap.get(DcMotor.class, "backLeft");
        DcMotor br = hardwareMap.get(DcMotor.class, "backRight");
        fl.setDirection(DcMotorSimple.Direction.REVERSE);
        bl.setDirection(DcMotorSimple.Direction.REVERSE);
        for (DcMotor m : new DcMotor[]{fl, fr, bl, br}) m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);

        DcMotor intake = hardwareMap.get(DcMotor.class, "intake");
        DcMotorEx shooter = hardwareMap.get(DcMotorEx.class, "shooter");
        shooter.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        shooter.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);
        DcMotor lift = hardwareMap.get(DcMotor.class, "lift");
        lift.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        lift.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        Servo feeder = hardwareMap.get(Servo.class, "feeder");
        Servo hood = hardwareMap.get(Servo.class, "hood");
        Servo claw = hardwareMap.get(Servo.class, "claw");

        IMU imu = hardwareMap.get(IMU.class, "imu");
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(
                RevHubOrientationOnRobot.LogoFacingDirection.UP, RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));

        double hoodPos = 0.5;
        boolean clawClosed = false, fieldCentric = false;
        feeder.setPosition(0.0);
        hood.setPosition(hoodPos);
        claw.setPosition(1.0);

        telemetry.addLine("Ready. Press START.");
        telemetry.update();
        waitForStart();

        while (opModeIsActive()) {
            // ---------------- drive
            double y = -gamepad1.left_stick_y, x = gamepad1.left_stick_x, rx = gamepad1.right_stick_x;
            if (gamepad1.yWasPressed()) fieldCentric = !fieldCentric;
            if (gamepad1.back) imu.resetYaw();
            if (fieldCentric) {
                double h = imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.RADIANS);
                double rotX = x * Math.cos(-h) - y * Math.sin(-h);
                double rotY = x * Math.sin(-h) + y * Math.cos(-h);
                x = rotX; y = rotY;
            }
            double scale = gamepad1.left_bumper ? 0.35 : 1.0;
            double d = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1);
            fl.setPower((y + x + rx) / d * scale);
            bl.setPower((y - x + rx) / d * scale);
            fr.setPower((y - x - rx) / d * scale);
            br.setPower((y + x - rx) / d * scale);

            // ---------------- mechanisms (gamepad2, or gamepad1 if nobody holds gamepad2)
            com.qualcomm.robotcore.hardware.Gamepad op = gamepad2.atRest() && !gamepad2.a && !gamepad2.b ? gamepad1 : gamepad2;
            intake.setPower(op.right_trigger > 0.1 ? 1.0 : op.left_trigger > 0.1 ? -0.8 : 0.0);
            if (op.a) shooter.setVelocity(2400 / 60.0 * 28);   // 2400 rpm on a 28 tick/rev motor
            else shooter.setPower(0);
            feeder.setPosition(op.b ? 1.0 : 0.0);
            if (op.dpad_up) hoodPos = Math.min(1, hoodPos + 0.01);
            if (op.dpad_down) hoodPos = Math.max(0, hoodPos - 0.01);
            hood.setPosition(hoodPos);
            lift.setPower(-op.right_stick_y);
            if (op.xWasPressed()) clawClosed = !clawClosed;
            claw.setPosition(clawClosed ? 0.0 : 1.0);

            telemetry.addData("Drive", fieldCentric ? "field-centric" : "robot-centric");
            telemetry.addData("Heading", "%.1f deg", imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES));
            telemetry.addData("Shooter", "%.0f rpm", shooter.getVelocity() / 28 * 60);
            telemetry.addData("Hood", "%.2f", hoodPos);
            telemetry.addData("Lift", lift.getCurrentPosition());
            telemetry.addData("Claw", clawClosed ? "closed" : "open");
            telemetry.update();
        }
    }
}
