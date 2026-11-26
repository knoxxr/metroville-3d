using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    /// <summary>
    /// Cities: Skylines damped RTS orbital camera controller.
    /// Supports WASD/Arrows pan, Right-Mouse orbit & pitch, Middle-Mouse drag pan,
    /// Scroll Zoom with automatic street-level pitch tilt when zooming close.
    /// </summary>
    public sealed class SkylinesCameraController : MonoBehaviour
    {
        public Vector3 TargetPosition = new Vector3(475f, 20f, 470f);
        public float YawDegrees = 35f;
        public float PitchDegrees = 36f;
        public float Distance = 240f;

        [Header("Camera Limits & Sensitivity")]
        public float MinDistance = 32f;
        public float MaxDistance = 540f;
        public float MinPitch = 14f;
        public float MaxPitch = 78f;
        public float PanSpeed = 1.15f;
        public float OrbitSensitivity = 0.28f;
        public float Damping = 10f;

        private Vector3 _curTarget;
        private float _curYaw;
        private float _curPitch;
        private float _curDist;
        private Vector3 _lastMousePos;

        private void Start()
        {
            _curTarget = TargetPosition;
            _curYaw = YawDegrees;
            _curPitch = PitchDegrees;
            _curDist = Distance;
            ApplyCameraTransform();
        }

        private void Update()
        {
            float dt = Time.unscaledDeltaTime;

            // 1. Keyboard Panning (WASD / Arrow Keys) & Rotation (Q/E)
            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");
            if (Mathf.Abs(h) > 0.01f || Mathf.Abs(v) > 0.01f)
            {
                Vector3 fwd = Quaternion.Euler(0f, YawDegrees, 0f) * Vector3.forward;
                Vector3 right = Quaternion.Euler(0f, YawDegrees, 0f) * Vector3.right;
                float speed = Mathf.Max(45f, Distance * PanSpeed) * dt;
                TargetPosition += (fwd * v + right * h).normalized * speed;
            }
            if (Input.GetKey(KeyCode.Q)) YawDegrees -= 72f * dt;
            if (Input.GetKey(KeyCode.E)) YawDegrees += 72f * dt;

            // 2. Scroll Wheel Zoom
            float scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.01f)
            {
                Distance *= 1f - scroll * 0.11f;
                Distance = Mathf.Clamp(Distance, MinDistance, MaxDistance);
            }

            // 3. Right-Mouse Orbit & Pitch (Cities: Skylines standard)
            if (Input.GetMouseButtonDown(1) || Input.GetMouseButtonDown(2))
            {
                _lastMousePos = Input.mousePosition;
            }
            if (Input.GetMouseButton(1))
            {
                Vector3 delta = Input.mousePosition - _lastMousePos;
                YawDegrees += delta.x * OrbitSensitivity;
                PitchDegrees = Mathf.Clamp(PitchDegrees - delta.y * OrbitSensitivity * 0.85f, MinPitch, MaxPitch);
                _lastMousePos = Input.mousePosition;
            }
            else if (Input.GetMouseButton(2))
            {
                Vector3 delta = Input.mousePosition - _lastMousePos;
                Vector3 fwd = Quaternion.Euler(0f, YawDegrees, 0f) * Vector3.forward;
                Vector3 right = Quaternion.Euler(0f, YawDegrees, 0f) * Vector3.right;
                float panScale = Distance * 0.0018f;
                TargetPosition -= (right * delta.x + fwd * delta.y) * panScale;
                _lastMousePos = Input.mousePosition;
            }

            // Clamp within playable valley
            TargetPosition.x = Mathf.Clamp(TargetPosition.x, 90f, CityConstants.WorldSizeMeters - 90f);
            TargetPosition.z = Mathf.Clamp(TargetPosition.z, 90f, CityConstants.WorldSizeMeters - 90f);
            TargetPosition.y = Mathf.Max(CityConstants.WaterLevelMeters, TerrainHeightfield.SampleHeight(TargetPosition.x, TargetPosition.z));

            // Exponential damping for cinematic smoothness
            float k = 1f - Mathf.Exp(-Damping * dt);
            _curTarget = Vector3.Lerp(_curTarget, TargetPosition, k);
            _curYaw = Mathf.LerpAngle(_curYaw, YawDegrees, k);
            _curPitch = Mathf.Lerp(_curPitch, PitchDegrees, k);
            _curDist = Mathf.Lerp(_curDist, Distance, k);

            ApplyCameraTransform();
        }

        private void ApplyCameraTransform()
        {
            Quaternion rot = Quaternion.Euler(_curPitch, _curYaw, 0f);
            Vector3 offset = rot * new Vector3(0f, 0f, -_curDist);
            transform.position = _curTarget + offset;
            transform.LookAt(_curTarget);
        }
    }
}
