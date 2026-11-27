using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace KarinsJigsaw;

/// <summary>
/// Shows the live web app on the address of the play module (`/play`, the app: the wrappers always open it, never the website), the same as server.url in frontend/capacitor.config.json (change both together).
/// The web app stays the one code base: deploy it and this window shows the new version, nothing to rebuild.
/// </summary>
public partial class MainWindow : Window
{
    public const string WindowTitle = "Karins jigsaw";
    private const string AppUrl = "https://karins-jigsaw.web.app/play";

    /// <summary>Pages that may open INSIDE the app (the app itself and the pages of the sign-in popup). Every other link opens in the browser.</summary>
    private static readonly string[] Inside = ["karins-jigsaw.web.app", "sevenfriends.io", "accounts.google.com", "firebaseapp.com"];

    public MainWindow()
    {
        InitializeComponent();
        Title = WindowTitle;
        // a small screen (a laptop at 125 or 150 % scaling): the window never starts bigger than the room there is, and its smallest size gives way too
        var room = SystemParameters.WorkArea;
        MinWidth = Math.Min(MinWidth, room.Width);
        MinHeight = Math.Min(MinHeight, room.Height);
        Width = Math.Min(Width, room.Width);
        Height = Math.Min(Height, room.Height);
        Loaded += async (_, _) => await StartAsync();
    }

    /// <summary>Brings the window forward (when a second copy is started).</summary>
    public void ShowApp()
    {
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
    }

    // ------------------------------------------------------------------ the web app

    private static bool IsInside(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme is "about" or "blob" or "data") return true;
        return uri.Scheme == Uri.UriSchemeHttps && Inside.Any(h => uri.Host == h || uri.Host.EndsWith("." + h));
    }

    /// <summary>A page of the web app itself (not of the sign-in).</summary>
    private static bool IsApp(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps && uri.Host == new Uri(AppUrl).Host;

    /// <summary>A link that leaves the app: opened in the browser (or the mail / phone app). Nothing else is ever started.</summary>
    private static void OpenOutside(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "mailto" or "tel")
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }

    private async Task StartAsync()
    {
        try
        {
            // the sign-in and the settings of the app are kept here, so the person stays signed in
            var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KarinsJigsaw", "WebView2");
            // thin round scrollbars that float over the page and show when the mouse moves (the Windows 11 look), not the old grey bar with arrow buttons
            var options = new CoreWebView2EnvironmentOptions { ScrollBarStyle = CoreWebView2ScrollbarStyle.FluentOverlay };
            await Web.EnsureCoreWebView2Async(await CoreWebView2Environment.CreateAsync(null, data, options));
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show("Karins jigsaw needs the Microsoft Edge WebView2 Runtime (it is part of Windows 11 and of Microsoft Edge).\n\nInstall it from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and start the app again.",
                WindowTitle, MessageBoxButton.OK, MessageBoxImage.Information);
            Application.Current.Shutdown();
            return;
        }

        var web = Web.CoreWebView2;
        web.Settings.AreDevToolsEnabled = false;
        web.Settings.IsStatusBarEnabled = false;
        // the app looks the same here as on a phone: no zoom (Ctrl + wheel, pinch) and always 100%, so a zoom set once cannot make the texts bigger or smaller for good
        web.Settings.IsZoomControlEnabled = false;
        web.Settings.IsPinchZoomEnabled = false;
        Web.ZoomFactor = 1.0;
        // a popup (the sign-in) opens in a small window of the app; any other new window goes to the browser
        web.NewWindowRequested += (_, e) =>
        {
            if (IsInside(e.Uri)) return;
            e.Handled = true;
            OpenOutside(e.Uri);
        };
        // the main window never leaves the app
        web.NavigationStarting += (_, e) =>
        {
            if (IsInside(e.Uri)) return;
            e.Cancel = true;
            OpenOutside(e.Uri);
        };
        // the one thing the app may ask for is the camera, for Take a photo, and only its own pages: the person is then asked (Default). Everything else (microphone, location, notifications ...) is refused
        web.PermissionRequested += (_, e) => e.State = e.PermissionKind == CoreWebView2PermissionKind.Camera && IsApp(e.Uri) ? CoreWebView2PermissionState.Default : CoreWebView2PermissionState.Deny;
        web.Navigate(AppUrl);
    }
}
