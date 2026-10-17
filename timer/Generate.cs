// Generates the Yoto timer prototype assets: for each timer, one mp3 (spoken
// "N minutes remaining" announcements over silence) and one animated 16x16 GIF
// icon (a ring around the minutes that unwinds as time runs down: full circle
// at the start, half a circle at the halfway point, gone at the end).
//
// Needs Windows (System.Speech voices), ffmpeg on PATH, and the .NET 10 SDK:
//
//     dotnet run timer/Generate.cs [-- --work-dir DIR]
//
// Outputs go to timer/audio/ and timer/icons/. Intermediate voice clips go to
// --work-dir (kept, for inspection) or a throwaway temp dir.

#:package System.Speech@10.*
#:property TargetFramework=net10.0-windows
// File-based apps default to AOT-style settings, which disable the COM interop
// that System.Speech relies on.
#:property PublishAot=false

using System.Diagnostics;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Speech.Synthesis;

string? workDir = null;
for (var i = 0; i < args.Length; i++)
{
    if (args[i] == "--work-dir" && i + 1 < args.Length) workDir = args[++i];
}

Generator.Run(workDir);

static class Generator
{
    static readonly string Here = Path.GetDirectoryName(ThisFile())!;
    static string ThisFile([CallerFilePath] string path = "") => path;
    static readonly string AudioDir = Path.Combine(Here, "audio");
    static readonly string IconDir = Path.Combine(Here, "icons");

    static readonly int[] Timers = [1, 5, 10]; // minutes
    const string Voice = "Microsoft Zira Desktop";
    const int SampleRate = 16000;
    // Mono speech over mostly-silence. Silence doesn't compress in CBR mp3, so
    // this is what dominates file size (24k = ~180 KB/min).
    const string Mp3Bitrate = "24k";

    const int IconSize = 16;
    static readonly byte[] IconColor = [244, 84, 54]; // #f45436
    const int RingRadius = 7;
    // True: the ring is eaten like a clock hand sweeping clockwise from 12
    // o'clock (so what's left at the halfway point is the left half). False:
    // it unwinds the other way, back towards 12 o'clock (the right half is left).
    const bool SweepClockwise = true;
    const int MinFrameSeconds = 10; // don't animate faster than this
    const int FinalHoldMs = 600_000; // how long the last (number-only) frame is held
    // Lattice centre: odd-width glyphs sit centred on pixel column/row 7.
    const int Center = 7;

    // 3x5 digit glyphs, same font as https://github.com/dochoffiday/YotoPixelText
    static readonly Dictionary<char, string[]> Font3x5 = new()
    {
        ['0'] = ["111", "101", "101", "101", "111"],
        ['1'] = ["010", "110", "010", "010", "111"],
        ['2'] = ["111", "001", "111", "100", "111"],
        ['3'] = ["111", "001", "111", "001", "111"],
        ['4'] = ["101", "101", "111", "001", "001"],
        ['5'] = ["111", "100", "111", "001", "111"],
        ['6'] = ["111", "100", "111", "101", "111"],
        ['7'] = ["111", "001", "010", "010", "010"],
        ['8'] = ["111", "101", "111", "101", "111"],
        ['9'] = ["111", "101", "111", "001", "111"],
    };

    // --- announcements ------------------------------------------------------

    /// <summary>Minutes-remaining values spoken during a timer, in order: the
    /// opening announcement, every 10-minute mark below that, then 5, 3 and 1.</summary>
    static List<int> AnnouncedRemainders(int minutes)
    {
        var marks = new List<int> { minutes };
        for (var r = (minutes - 1) / 10 * 10; r > 0; r -= 10) marks.Add(r);
        foreach (var r in new[] { 5, 3, 1 })
        {
            if (r < minutes) marks.Add(r);
        }
        return marks;
    }

    static string Phrase(int remaining) => $"{remaining} minute{(remaining == 1 ? "" : "s")} remaining";

    /// <summary>Render {name: text} to dir/name.wav with the Windows voice.</summary>
    static void Synthesize(Dictionary<string, string> phrases, string dir)
    {
        using var synth = new SpeechSynthesizer();
        synth.SelectVoice(Voice);
        synth.Rate = -1;
        foreach (var (name, text) in phrases)
        {
            synth.SetOutputToWaveFile(Path.Combine(dir, name + ".wav"));
            synth.Speak(text);
            synth.SetOutputToNull(); // finalizes the file
        }
    }

    static void WriteBeeps(string path)
    {
        var beepLength = (int)(0.18 * SampleRate);
        var gapLength = (int)(0.12 * SampleRate);
        var lastT = (beepLength - 1) / (double)SampleRate;

        var samples = new List<short>();
        for (var repeat = 0; repeat < 3; repeat++)
        {
            for (var i = 0; i < beepLength; i++)
            {
                var t = i / (double)SampleRate;
                var value = 0.5 * Math.Sin(2 * Math.PI * 880 * t) * Math.Sin(Math.PI * t / lastT); // faded in/out
                samples.Add((short)(value * 32767));
            }
            for (var i = 0; i < gapLength; i++) samples.Add(0);
        }

        using var w = new BinaryWriter(File.Create(path));
        var dataBytes = samples.Count * 2;
        w.Write("RIFF"u8);
        w.Write(36 + dataBytes);
        w.Write("WAVEfmt "u8);
        w.Write(16);
        w.Write((short)1); // PCM
        w.Write((short)1); // mono
        w.Write(SampleRate);
        w.Write(SampleRate * 2);
        w.Write((short)2);
        w.Write((short)16);
        w.Write("data"u8);
        w.Write(dataBytes);
        foreach (var s in samples) w.Write(s);
    }

    /// <summary>Duration of a PCM wav file, in seconds.</summary>
    static double WavSeconds(string path)
    {
        var d = File.ReadAllBytes(path);
        uint sampleRate = 0, blockAlign = 0, dataSize = 0;
        for (var pos = 12; pos + 8 <= d.Length;)
        {
            var id = System.Text.Encoding.ASCII.GetString(d, pos, 4);
            var size = BitConverter.ToUInt32(d, pos + 4);
            if (id == "fmt ")
            {
                sampleRate = BitConverter.ToUInt32(d, pos + 12);
                blockAlign = BitConverter.ToUInt16(d, pos + 20);
            }
            else if (id == "data")
            {
                dataSize = size;
                break;
            }
            pos += 8 + (int)size + (int)(size & 1);
        }
        return dataSize / blockAlign / (double)sampleRate;
    }

    static void BuildMp3(int minutes, Dictionary<string, string> clips, string outPath)
    {
        var schedule = AnnouncedRemainders(minutes)
            .Select(r => (Start: (minutes - r) * 60.0, Path: clips[$"remaining-{r}"]))
            .ToList();
        var end = minutes * 60.0;
        var beepsEnd = end + WavSeconds(clips["beeps"]);
        schedule.Add((end, clips["beeps"]));
        schedule.Add((beepsEnd + 0.3, clips["times-up"]));
        var total = beepsEnd + 0.3 + WavSeconds(clips["times-up"]) + 1.5;

        var psi = new ProcessStartInfo("ffmpeg") { UseShellExecute = false };
        void Arg(params string[] values)
        {
            foreach (var v in values) psi.ArgumentList.Add(v);
        }

        Arg("-y", "-loglevel", "error", "-f", "lavfi", "-i", $"anullsrc=r={SampleRate}:cl=mono");
        var filters = new List<string>();
        for (var i = 0; i < schedule.Count; i++)
        {
            var n = i + 1;
            Arg("-i", schedule[i].Path);
            filters.Add(
                $"[{n}:a]aresample={SampleRate},aformat=channel_layouts=mono," +
                $"adelay={(long)Math.Round(schedule[i].Start * 1000)}:all=1[a{n}]");
        }
        var labels = "[0:a]" + string.Concat(Enumerable.Range(1, schedule.Count).Select(n => $"[a{n}]"));
        filters.Add($"{labels}amix=inputs={schedule.Count + 1}:normalize=0:duration=first[out]");
        Arg(
            "-filter_complex", string.Join(";", filters), "-map", "[out]",
            "-t", total.ToString("F2", CultureInfo.InvariantCulture),
            "-ac", "1", "-ar", SampleRate.ToString(CultureInfo.InvariantCulture),
            "-codec:a", "libmp3lame", "-b:a", Mp3Bitrate, outPath);

        using var process = Process.Start(psi)!;
        process.WaitForExit();
        if (process.ExitCode != 0) throw new InvalidOperationException($"ffmpeg failed ({process.ExitCode}) building {outPath}");
    }

    // --- icons --------------------------------------------------------------

    static HashSet<(int X, int Y)> NumberPixels(string text)
    {
        var width = text.Length * 3 + (text.Length - 1);
        var x0 = (IconSize - width) / 2;
        var y0 = (IconSize - 5) / 2;
        var pixels = new HashSet<(int, int)>();
        for (var i = 0; i < text.Length; i++)
        {
            var glyph = Font3x5[text[i]];
            for (var gy = 0; gy < glyph.Length; gy++)
            {
                for (var gx = 0; gx < glyph[gy].Length; gx++)
                {
                    if (glyph[gy][gx] == '1') pixels.Add((x0 + i * 4 + gx, y0 + gy));
                }
            }
        }
        return pixels;
    }

    /// <summary>The ring's pixels, sorted clockwise starting from 12 o'clock.</summary>
    static List<(int X, int Y)> RingPixelsInOrder()
    {
        static double Distance((int X, int Y) p) => Math.Sqrt((p.X - Center) * (p.X - Center) + (p.Y - Center) * (p.Y - Center));

        static double Angle((int X, int Y) p) // 0 = 12 o'clock, increasing clockwise
        {
            var a = Math.Atan2(p.X - Center, Center - p.Y);
            return a < 0 ? a + 2 * Math.PI : a;
        }

        return Enumerable.Range(0, IconSize)
            .SelectMany(x => Enumerable.Range(0, IconSize).Select(y => (X: x, Y: y)))
            .Where(p => Distance(p) >= RingRadius - 0.5 && Distance(p) < RingRadius + 0.5)
            .OrderBy(Angle)
            .ThenBy(Distance)
            .ToList();
    }

    /// <summary>GIF LZW data using only literal codes plus a clear code every 128
    /// pixels. That's valid (if uncompressed) and keeps the code size fixed, which
    /// avoids the fiddly part of a real LZW encoder — fine for 256-pixel frames.</summary>
    static byte[] LzwLiterals(byte[] indices)
    {
        const int minCodeSize = 8;
        const int clear = 1 << minCodeSize;
        const int eoi = clear + 1;
        var output = new List<byte>();
        var bits = 0;
        var bitCount = 0;

        void Put(int code)
        {
            bits |= code << bitCount;
            bitCount += minCodeSize + 1;
            while (bitCount >= 8)
            {
                output.Add((byte)(bits & 0xFF));
                bits >>= 8;
                bitCount -= 8;
            }
        }

        for (var i = 0; i < indices.Length; i += 128)
        {
            Put(clear);
            for (var j = i; j < Math.Min(i + 128, indices.Length); j++) Put(indices[j]);
        }
        Put(eoi);
        if (bitCount > 0) output.Add((byte)(bits & 0xFF));
        return [.. output];
    }

    static void WriteSubBlocks(Stream s, byte[] data)
    {
        for (var i = 0; i < data.Length; i += 255)
        {
            var length = Math.Min(255, data.Length - i);
            s.WriteByte((byte)length);
            s.Write(data, i, length);
        }
        s.WriteByte(0);
    }

    static void WriteUInt16(Stream s, int value)
    {
        s.WriteByte((byte)(value & 0xFF));
        s.WriteByte((byte)(value >> 8));
    }

    /// <summary>Write a 16x16 GIF89a where every frame is a full-size frame (many
    /// encoders crop frames to what changed, and a tiny display player may not
    /// cope with sub-rectangles). Palette index 0 is transparent, 1 is the icon
    /// colour. No Netscape loop extension, so it plays once and holds the last frame.</summary>
    static void WriteGif(string path, List<HashSet<(int, int)>> frames, List<int> delaysMs)
    {
        using var s = File.Create(path);
        s.Write("GIF89a"u8);
        WriteUInt16(s, IconSize);
        WriteUInt16(s, IconSize);
        s.Write([0xF7, 0, 0]); // 256-colour global table, background 0, no aspect
        var palette = new byte[768];
        IconColor.CopyTo(palette, 3);
        s.Write(palette);

        for (var f = 0; f < frames.Count; f++)
        {
            // Graphic control: dispose to background, transparent colour index 0.
            s.Write([0x21, 0xF9, 0x04, (2 << 2) | 1]);
            WriteUInt16(s, Math.Min(65535, (int)Math.Round(delaysMs[f] / 10.0)));
            s.Write([0x00, 0x00]);
            // Image descriptor: full frame, no local colour table.
            s.WriteByte(0x2C);
            WriteUInt16(s, 0);
            WriteUInt16(s, 0);
            WriteUInt16(s, IconSize);
            WriteUInt16(s, IconSize);
            s.WriteByte(0);

            var indices = new byte[IconSize * IconSize];
            for (var y = 0; y < IconSize; y++)
            {
                for (var x = 0; x < IconSize; x++) indices[y * IconSize + x] = (byte)(frames[f].Contains((x, y)) ? 1 : 0);
            }
            s.WriteByte(8);
            WriteSubBlocks(s, LzwLiterals(indices));
        }
        s.WriteByte(0x3B);
    }

    /// <summary>Frames (sets of lit pixels) and their durations in ms. Frame 0 is
    /// the full ring (100% of the time left); each later frame has eaten a bit
    /// more of it, so the ring is half gone at the halfway point. Once the time is
    /// up the ring is gone and just the minutes remain.</summary>
    static (List<HashSet<(int, int)>> Frames, List<int> Durations) IconFrames(int minutes)
    {
        var number = NumberPixels(minutes.ToString(CultureInfo.InvariantCulture));
        var ring = RingPixelsInOrder();
        var steps = Math.Min(ring.Count, Math.Max(1, minutes * 60 / MinFrameSeconds));

        var frames = new List<HashSet<(int, int)>>();
        for (var k = 0; k < steps; k++)
        {
            var eaten = (int)Math.Round(ring.Count * (double)k / steps);
            var left = SweepClockwise ? ring.Skip(eaten) : ring.Take(ring.Count - eaten);
            var frame = new HashSet<(int, int)>(number);
            frame.UnionWith(left);
            frames.Add(frame);
        }
        frames.Add(number);

        var durations = Enumerable.Repeat((int)Math.Round(minutes * 60 * 1000 / (double)steps), steps).ToList();
        durations.Add(FinalHoldMs);
        return (frames, durations);
    }

    static (int FrameCount, int FirstDurationMs) BuildGif(int minutes, string outPath)
    {
        var (frames, durations) = IconFrames(minutes);
        WriteGif(outPath, frames, durations);
        return (frames.Count, durations[0]);
    }

    // --- main ---------------------------------------------------------------

    public static void Run(string? workDirArg)
    {
        Directory.CreateDirectory(AudioDir);
        Directory.CreateDirectory(IconDir);

        var needed = Timers.SelectMany(AnnouncedRemainders).Distinct().OrderByDescending(r => r);
        var phrases = needed.ToDictionary(r => $"remaining-{r}", Phrase);
        phrases["times-up"] = "Time's up!";

        var keepWorkDir = workDirArg is not null;
        var work = workDirArg ?? Directory.CreateTempSubdirectory("yoto-timer-").FullName;
        Directory.CreateDirectory(work);
        try
        {
            Synthesize(phrases, work);
            var clips = phrases.Keys.ToDictionary(name => name, name => Path.Combine(work, name + ".wav"));
            clips["beeps"] = Path.Combine(work, "beeps.wav");
            WriteBeeps(clips["beeps"]);

            foreach (var minutes in Timers)
            {
                var mp3 = Path.Combine(AudioDir, $"timer-{minutes}.mp3");
                BuildMp3(minutes, clips, mp3);
                var (frameCount, firstMs) = BuildGif(minutes, Path.Combine(IconDir, $"timer-{minutes}.gif"));
                Console.WriteLine(
                    $"timer-{minutes}: announces [{string.Join(", ", AnnouncedRemainders(minutes))}], " +
                    $"mp3 {new FileInfo(mp3).Length / 1024.0:F0} KB, gif {frameCount} frames ({firstMs / 1000.0:F1}s each)");
            }
        }
        finally
        {
            if (!keepWorkDir) Directory.Delete(work, recursive: true);
        }
    }
}
