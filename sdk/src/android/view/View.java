package android.view;

/** Robot Controller screen widgets do not exist in the simulator. */
public class View {
    public boolean post(Runnable action) { return true; }
    public void setBackgroundColor(int color) {}
    public void setVisibility(int visibility) {}
    public static final int VISIBLE = 0, INVISIBLE = 4, GONE = 8;
}
