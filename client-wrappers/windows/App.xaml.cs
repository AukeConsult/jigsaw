using System.Threading;
using System.Windows;

namespace KarinsJigsaw;

/// <summary>
/// One copy only: a second start asks the first one to show its window and ends.
/// </summary>
public partial class App : Application
{
    private static Mutex? _only;
    private static EventWaitHandle? _show;

    protected override void OnStartup(StartupEventArgs e)
    {
        _only = new Mutex(true, "io.karinsjigsaw.app", out var first);
        _show = new EventWaitHandle(false, EventResetMode.AutoReset, "io.karinsjigsaw.app.show");
        if (!first)
        {
            _show.Set();
            Shutdown();
            return;
        }
        base.OnStartup(e);

        var window = new MainWindow();
        MainWindow = window;
        window.Show();
        new Thread(() =>
        {
            while (_show.WaitOne()) Dispatcher.Invoke(window.ShowApp);
        }) { IsBackground = true }.Start();
    }
}
