import assert from 'assert';
const { codeDeviceNames, missingNames, suggest } = await import('../web/js/names.js');
const code = `DcMotor lf = hardwareMap.get(DcMotor.class, "leftFront");
 DcMotorEx rb = hardwareMap.get(DcMotorEx.class,"right_back_drive");
 DcMotor a = hardwareMap.dcMotor.get("motorFL");  DcMotor b = hardwareMap.dcMotor.get("rf");
 IMU imu = hardwareMap.get(IMU.class, "imu"); WebcamName c = hardwareMap.get(WebcamName.class, "Webcam");
 Servo s = hardwareMap.servo.get("claw"); DistanceSensor d = hardwareMap.get(DistanceSensor.class, "intakeColor");`;
const robot = [['frontLeft','motor'],['frontRight','motor'],['backLeft','motor'],['backRight','motor'],['lift','motor'],['claw','servo'],['imu','imu'],['Webcam 1','webcam'],['intakeColor','color']].map(([name,type])=>({name,type}));
const want = codeDeviceNames([{ name: 'A.java', code }]);
assert.equal(want.length, 8);
const miss = missingNames([{ name: 'A.java', code }], robot);
const taken = new Set(); const got = Object.fromEntries(miss.map(w => { const g = suggest(w, robot, taken); taken.add(g); return [w.name, g]; }));
console.log(got);
assert.deepEqual(got, { leftFront: 'frontLeft', right_back_drive: 'backRight', motorFL: null, rf: 'frontRight', Webcam: 'Webcam 1' });
console.log('names ok');
// names kept in constants, also from another file; a method call is skipped
const files2 = [{ name: 'Names.java', code: 'public class Names { public static final String LF = "lf_drive"; }' },
  { name: 'B.java', code: 'DcMotor m = hardwareMap.get(DcMotor.class, Names.LF); Servo s = hardwareMap.servo.get(CLAW); static final String CLAW = "clawServo"; DcMotor x = hardwareMap.get(DcMotor.class, nameFor(1));' }];
assert.deepEqual(codeDeviceNames(files2).map(w => w.name), ['lf_drive', 'clawServo']);
console.log('constants ok');
