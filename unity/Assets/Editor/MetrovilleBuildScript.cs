#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Metroville.Editor
{
    /// <summary>
    /// Cross-platform native desktop installer build script for Windows (x64) and macOS (Universal .app).
    /// Supports both Unity Editor Menu clicks and headless CI/CD -executeMethod builds.
    /// </summary>
    public static class MetrovilleBuildScript
    {
        private static readonly string[] Scenes = { "Assets/Scenes/MainCity.unity" };

        [MenuItem("Metroville/5. Build Windows Native (x64 .exe)", false, 20)]
        public static void BuildWindows()
        {
            EnsureSceneExists();
            string outDir = "Builds/Windows";
            Directory.CreateDirectory(outDir);
            BuildPlayerOptions opts = new BuildPlayerOptions
            {
                scenes = Scenes,
                locationPathName = Path.Combine(outDir, "Metroville3D.exe"),
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.CompressWithLz4HC
            };
            RunBuild(opts, "Windows x64");
        }

        [MenuItem("Metroville/6. Build macOS Native (Universal .app)", false, 21)]
        public static void BuildMacOS()
        {
            EnsureSceneExists();
            string outDir = "Builds/macOS";
            Directory.CreateDirectory(outDir);
            BuildPlayerOptions opts = new BuildPlayerOptions
            {
                scenes = Scenes,
                locationPathName = Path.Combine(outDir, "Metroville3D.app"),
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.CompressWithLz4HC
            };
            RunBuild(opts, "macOS Universal");
        }

        /// <summary>
        /// Headless CLI entrypoint for Build-Windows-Installer.ps1 and GitHub Actions:
        ///   Unity.exe -batchmode -nographics -projectPath unity -executeMethod Metroville.Editor.MetrovilleBuildScript.BuildWindowsCLI -quit
        /// </summary>
        public static void BuildWindowsCLI()
        {
            try
            {
                Debug.Log("[Metroville CLI] 1/3 Setting up URP 6 scene, shaders & UI Toolkit HUD...");
                MetrovilleEditorSetup.SetupEverything();

                Debug.Log("[Metroville CLI] 2/3 Downloading Poly Haven CC0 PBR textures (1k)...");
                try
                {
                    MetrovilleCC0AssetPipeline.DownloadAndLinkPolyHavenPBR("1k");
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[Metroville CLI] Poly Haven offline fallback (using procedural PBR): {ex.Message}");
                }

                Debug.Log("[Metroville CLI] 3/3 Building StandaloneWindows64 -> Builds/Windows/Metroville3D.exe...");
                string outDir = "Builds/Windows";
                Directory.CreateDirectory(outDir);
                BuildPlayerOptions opts = new BuildPlayerOptions
                {
                    scenes = Scenes,
                    locationPathName = Path.Combine(outDir, "Metroville3D.exe"),
                    target = BuildTarget.StandaloneWindows64,
                    options = BuildOptions.CompressWithLz4HC
                };

                BuildReport report = BuildPipeline.BuildPlayer(opts);
                if (report.summary.result == BuildResult.Succeeded)
                {
                    Debug.Log($"[Metroville CLI] SUCCESS! ({report.summary.totalSize / (1024f * 1024f):F1} MB)");
                }
                else
                {
                    throw new Exception($"[Metroville CLI] FAILED: {report.summary.result}");
                }
            }
            catch (Exception ex)
            {
                Debug.LogException(ex);
                throw;
            }
        }

        private static void EnsureSceneExists()
        {
            if (!File.Exists(Scenes[0]))
            {
                MetrovilleEditorSetup.SetupEverything();
            }
        }

        private static void RunBuild(BuildPlayerOptions opts, string label)
        {
            BuildReport report = BuildPipeline.BuildPlayer(opts);
            if (report.summary.result == BuildResult.Succeeded)
            {
                Debug.Log($"[Metroville] {label} 빌드 성공! ({report.summary.totalSize / (1024f * 1024f):F1} MB) -> {opts.locationPathName}");
                if (!Application.isBatchMode)
                    EditorUtility.RevealInFinder(opts.locationPathName);
            }
            else
            {
                Debug.LogError($"[Metroville] {label} 빌드 실패: {report.summary.result}");
            }
        }
    }
}
#endif
