export const HELP_HTML = `<div class="help">
<h3>Quick start</h3>
<ol>
<li><b>Code</b>: paste your <code>.java</code>, press <b>Build</b> (<kbd>Ctrl</kbd>+<kbd>S</kbd>).</li>
<li><b>Driver Hub</b>: pick the OpMode, <b>Init</b>, <b>Start</b>.</li>
<li>No code? Drive with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> and the arrows, <kbd>C</kbd> intake, <kbd>1</kbd> flywheel, <kbd>E</kbd> shoot. <b>Keys</b> under the field shows the rest.</li>
</ol>

<h4>Sections</h4>
<table class="t">
<tr><td><b>Drive</b></td><td>Missions with stars and records, match against bots, full match</td></tr>
<tr><td><b>Robot</b></td><td>Load your CAD, inspection, wiring to the hubs, calibration</td></tr>
<tr><td><b>Driver Hub</b></td><td>The Driver Station app: OpModes, INIT / START / STOP, Configure Robot</td></tr>
<tr><td><b>Tests</b></td><td>Shooter, intake, drivetrain, lift on their own. Auto ×N for reliability</td></tr>
<tr><td><b>Code</b></td><td>Your OpModes. Init / Start / Stop work here too</td></tr>
<tr><td><b>Settings</b></td><td>Graphics, sound, gamepads, sensor noise</td></tr>
</table>


<details><summary>Limits</summary>
<ul>
<li>Intake and launch use a capture zone and the flywheel speed, not rubber on the ball.</li>
<li>No breakage, backlash, wiring or motor heating.</li>
<li>AprilTags are found geometrically, not from a camera image.</li>
<li>HIVE tip torque and ball masses are estimates. Field sizes come from the manual (±1 in).</li>
<li>Not supported: OctoQuad, SparkFun OTOS, HuskyLens, navX, BNO055IMU, OpenCV processors.</li>
</ul></details>
</div>`;
