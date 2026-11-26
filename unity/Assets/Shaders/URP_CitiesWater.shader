Shader "Metroville/URP/CitiesWater"
{
    Properties
    {
        _ShallowColor ("Shallow Turquoise", Color) = (0.18, 0.50, 0.58, 1.0)
        _DeepColor ("Deep River Navy", Color) = (0.06, 0.22, 0.34, 1.0)
        _SkyReflectColor ("Sky Reflection Tint", Color) = (0.76, 0.88, 0.98, 1.0)
        _FoamColor ("Shoreline Foam", Color) = (0.92, 0.96, 0.99, 1.0)
        _DepthFade ("Water Depth Absorption (m)", Range(1.0, 20.0)) = 7.5
        _FoamDistance ("Shoreline Foam Width (m)", Range(0.2, 4.0)) = 1.65
        _WaveScale ("Wave Scale", Float) = 0.085
        _WaveSpeed ("Wave Speed", Float) = 0.55
        _NormalStrength ("Wave Normal Strength", Range(0.05, 1.2)) = 0.42
        _RefractionStrength ("Refraction Distortion", Range(0.0, 0.08)) = 0.022
        _SpecPower ("Sun Sparkle Sharpness", Range(32.0, 512.0)) = 220.0
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Transparent"
            "Queue" = "Transparent"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Back

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareOpaqueTexture.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _ShallowColor;
                half4 _DeepColor;
                half4 _SkyReflectColor;
                half4 _FoamColor;
                float _DepthFade;
                float _FoamDistance;
                float _WaveScale;
                float _WaveSpeed;
                float _NormalStrength;
                float _RefractionStrength;
                float _SpecPower;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float4 screenPos  : TEXCOORD1;
                float  fogFactor  : TEXCOORD2;
            };

            float hash21(float2 p)
            {
                p = frac(p * float2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return frac(p.x * p.y);
            }

            float vnoise(float2 p)
            {
                float2 i = floor(p);
                float2 f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + float2(1.0, 0.0));
                float c = hash21(i + float2(0.0, 1.0));
                float d = hash21(i + float2(1.0, 1.0));
                return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
            }

            float waveHeight(float2 xz, float t)
            {
                float2 p = xz * _WaveScale;
                float w = sin(p.x * 1.4 + p.y * 0.9 - t * 1.4) * 0.45;
                w += cos(p.x * 2.3 - p.y * 1.8 - t * 1.1) * 0.30;
                w += (vnoise(p * 1.8 + float2(t * 0.35, -t * 0.25)) - 0.5) * 0.65;
                w += (vnoise(p * 4.5 + float2(-t * 0.52, t * 0.41)) - 0.5) * 0.32;
                return w;
            }

            Varyings vert(Attributes input)
            {
                Varyings o;
                VertexPositionInputs posInputs = GetVertexPositionInputs(input.positionOS.xyz);
                o.positionCS = posInputs.positionCS;
                o.positionWS = posInputs.positionWS;
                o.screenPos = ComputeScreenPos(o.positionCS);
                o.fogFactor = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                float2 screenUV = i.screenPos.xy / max(i.screenPos.w, 1e-5);
                float t = _Time.y * _WaveSpeed;

                // Procedural multi-octave capillary & river swell normal via finite difference
                float eps = 0.25;
                float hC = waveHeight(i.positionWS.xz, t);
                float hX = waveHeight(i.positionWS.xz + float2(eps, 0.0), t);
                float hZ = waveHeight(i.positionWS.xz + float2(0.0, eps), t);
                float3 N = normalize(float3((hC - hX) * _NormalStrength, 1.0, (hC - hZ) * _NormalStrength));

                // Linear eye depth of seabed vs water surface for Beer-Lambert absorption & shoreline foam
                float rawSceneDepth = SampleSceneDepth(screenUV);
                float sceneEyeDepth = LinearEyeDepth(rawSceneDepth, _ZBufferParams);
                float surfaceEyeDepth = i.screenPos.w;
                float waterDepth = max(0.0, sceneEyeDepth - surfaceEyeDepth);

                // Screen-space refracted underwater color
                float2 refractUV = saturate(screenUV + N.xz * _RefractionStrength * saturate(waterDepth * 0.5));
                half3 sceneCol = SampleSceneColor(refractUV);

                float depthT = saturate(1.0 - exp(-waterDepth / max(_DepthFade, 0.1)));
                half3 waterBody = lerp(_ShallowColor.rgb, _DeepColor.rgb, depthT);
                half3 underwater = lerp(sceneCol * lerp(half3(1,1,1), _ShallowColor.rgb * 1.25, 0.35), waterBody, saturate(0.28 + depthT * 0.72));

                // View, Main Light, Physical Schlick Fresnel & Sky + Cloud Reflection
                Light mainLight = GetMainLight();
                float3 V = normalize(GetWorldSpaceViewDir(i.positionWS));
                float3 R = reflect(-V, N);
                float NdotV = saturate(dot(N, V));
                float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 4.2);

                float2 cloudUV = R.xz / max(R.y + 0.28, 0.15) * 1.1 + float2(_Time.y * 0.008, 0.0);
                float clouds = smoothstep(0.48, 0.78, vnoise(cloudUV * 1.8) * 0.65 + vnoise(cloudUV * 3.8) * 0.35);
                half3 skyRefl = lerp(_SkyReflectColor.rgb * 0.80, _SkyReflectColor.rgb * 1.18, saturate(R.y * 1.6));
                skyRefl = lerp(skyRefl, half3(0.97, 0.98, 1.0), clouds * 0.42);

                // Crisp sunlit specular sparkle path
                float3 H = normalize(mainLight.direction + V);
                float specTight = pow(saturate(dot(N, H)), _SpecPower);
                float specBroad = pow(saturate(dot(N, H)), 28.0) * 0.14;
                half3 specular = mainLight.color * (specTight * 1.9 + specBroad);

                half3 col = lerp(underwater, skyRefl, saturate(fresnel * 0.85)) + specular;

                // Organic shoreline & bridge-pier contact foam
                float foamNoise = vnoise(i.positionWS.xz * 0.45 + float2(t * 0.9, -t * 0.6));
                float shoreMask = 1.0 - saturate(waterDepth / max(_FoamDistance, 0.1));
                float foam = smoothstep(0.32, 0.78, shoreMask * (0.65 + foamNoise * 0.65));
                col = lerp(col, _FoamColor.rgb, foam * 0.55);

                col = MixFog(col, i.fogFactor);
                half alpha = saturate(waterDepth * 1.6);
                return half4(col, alpha);
            }
            ENDHLSL
        }
    }
}
