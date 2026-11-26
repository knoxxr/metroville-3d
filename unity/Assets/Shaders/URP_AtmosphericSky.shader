Shader "Metroville/URP/AtmosphericSky"
{
    Properties
    {
        _ZenithColor ("Zenith Sky Color", Color) = (0.20, 0.48, 0.80, 1.0)
        _HorizonColor ("Horizon Haze Color", Color) = (0.82, 0.91, 0.98, 1.0)
        _GroundColor ("Lower Hemisphere Color", Color) = (0.42, 0.48, 0.42, 1.0)
        _SunColor ("Sun Disc & Glow Color", Color) = (1.0, 0.96, 0.86, 1.0)
        _CloudCoverage ("Cloud Coverage", Range(0.0, 1.0)) = 0.52
        _NightFactor ("Night Factor", Range(0.0, 1.0)) = 0.0
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Background"
            "RenderType" = "Background"
            "PreviewType" = "Skybox"
            "RenderPipeline" = "UniversalPipeline"
        }
        Cull Off
        ZWrite Off

        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _ZenithColor;
                half4 _HorizonColor;
                half4 _GroundColor;
                half4 _SunColor;
                float _CloudCoverage;
                float _NightFactor;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 dirWS      : TEXCOORD0;
            };

            float hash21(float2 p)
            {
                p = frac(p * float2(127.1, 311.7));
                p += dot(p, p + 41.2);
                return frac(p.x * p.y);
            }

            float fbm(float2 p)
            {
                float v = 0.0;
                float a = 0.5;
                for (int k = 0; k < 4; k++)
                {
                    float2 i = floor(p);
                    float2 f = frac(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float n = lerp(lerp(hash21(i), hash21(i + float2(1, 0)), f.x),
                                   lerp(hash21(i + float2(0, 1)), hash21(i + float2(1, 1)), f.x), f.y);
                    v += a * n;
                    p = p * 2.07 + float2(13.1, 7.7);
                    a *= 0.5;
                }
                return v;
            }

            Varyings vert(Attributes input)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                o.dirWS = input.positionOS.xyz;
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                float3 d = normalize(i.dirWS);
                Light sun = GetMainLight();
                float3 sunDir = normalize(sun.direction);

                // Rayleigh sky gradient + warm horizon scattering band
                float up = saturate(d.y);
                half3 sky = lerp(_HorizonColor.rgb, _ZenithColor.rgb, pow(up, 0.55));
                float horizonGlow = exp(-abs(d.y) * 8.5);
                sky = lerp(sky, _HorizonColor.rgb * 1.08, horizonGlow * 0.45);
                if (d.y < 0.0)
                    sky = lerp(_HorizonColor.rgb, _GroundColor.rgb, saturate(-d.y * 4.0));

                // Mie forward scattering around the sun + crisp solar disc
                float sunDot = saturate(dot(d, sunDir));
                sky += _SunColor.rgb * pow(sunDot, 8.0) * 0.28 * (1.0 - _NightFactor * 0.85);
                sky += _SunColor.rgb * smoothstep(0.9985, 0.9996, sunDot) * 2.4 * (1.0 - _NightFactor);

                // Layered drifting cumulus clouds lit by the sun
                if (d.y > 0.03)
                {
                    float2 cuv = d.xz / (d.y + 0.22) * 1.15 + float2(_Time.y * 0.006, _Time.y * 0.002);
                    float cl = fbm(cuv * 2.1);
                    float cloudMask = smoothstep(1.0 - _CloudCoverage, 0.88, cl) * smoothstep(0.03, 0.20, d.y);
                    half3 cloudBright = lerp(_HorizonColor.rgb * 1.06, half3(1.0, 0.99, 0.97), 0.65 - _NightFactor * 0.55);
                    cloudBright += _SunColor.rgb * pow(sunDot, 4.0) * 0.25 * (1.0 - _NightFactor);
                    sky = lerp(sky, cloudBright, cloudMask * 0.65);
                }

                // Subtle stars at night
                if (_NightFactor > 0.25 && d.y > 0.1)
                {
                    float2 starGrid = floor(d.xz / max(d.y, 0.1) * 95.0);
                    float star = step(0.994, hash21(starGrid)) * _NightFactor * smoothstep(0.1, 0.45, d.y);
                    sky += half3(0.85, 0.92, 1.0) * star;
                }

                return half4(sky, 1.0);
            }
            ENDHLSL
        }
    }
}
