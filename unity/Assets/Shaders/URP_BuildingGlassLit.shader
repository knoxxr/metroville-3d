Shader "Metroville/URP/BuildingGlassLit"
{
    Properties
    {
        _BaseColor ("Facade Masonry / Frame Color", Color) = (0.82, 0.86, 0.90, 1.0)
        _GlassTint ("Curtain Wall Glass Tint", Color) = (0.36, 0.56, 0.74, 1.0)
        _NightWindowColor ("Warm Interior Night Glow", Color) = (1.0, 0.84, 0.54, 1.0)
        _FloorsPerMeter ("Floors per Meter", Float) = 0.28
        _RoomsPerMeter ("Windows per Meter", Float) = 0.24
        _MullionWidth ("Frame / Mullion Width", Range(0.04, 0.35)) = 0.14
        _NightFactor ("Night Illumination Factor", Range(0.0, 1.0)) = 0.0
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Opaque"
            "Queue" = "Geometry"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
                half4 _GlassTint;
                half4 _NightWindowColor;
                float _FloorsPerMeter;
                float _RoomsPerMeter;
                float _MullionWidth;
                float _NightFactor;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS   : TEXCOORD1;
                float  fogFactor  : TEXCOORD2;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            float hash21(float2 p)
            {
                p = frac(p * float2(234.34, 435.345));
                p += dot(p, p + 34.23);
                return frac(p.x * p.y);
            }

            Varyings vert(Attributes input)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, o);
                VertexPositionInputs posInputs = GetVertexPositionInputs(input.positionOS.xyz);
                VertexNormalInputs normInputs = GetVertexNormalInputs(input.normalOS);
                o.positionCS = posInputs.positionCS;
                o.positionWS = posInputs.positionWS;
                o.normalWS = normInputs.normalWS;
                o.fogFactor = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                float3 N = normalize(i.normalWS);
                float3 V = normalize(GetWorldSpaceViewDir(i.positionWS));
                float4 shadowCoord = TransformWorldToShadowCoord(i.positionWS);
                Light mainLight = GetMainLight(shadowCoord);

                float NdotL = saturate(dot(N, mainLight.direction));
                float shadow = mainLight.shadowAttenuation;
                half3 skyAmbient = SampleSH(N) * 0.95;

                // Roof surfaces render as weathered concrete / gravel membrane
                if (abs(N.y) > 0.75)
                {
                    half3 roofAlbedo = _BaseColor.rgb * half3(0.76, 0.78, 0.80);
                    half3 roofLit = roofAlbedo * (mainLight.color * NdotL * shadow + skyAmbient);
                    return half4(MixFog(roofLit, i.fogFactor), 1.0);
                }

                // World-space architectural facade coordinates (prevents texture stretching on any building height!)
                float horizCoord = abs(N.x) > 0.5 ? i.positionWS.z : i.positionWS.x;
                float2 gridUV = float2(horizCoord * _RoomsPerMeter, i.positionWS.y * _FloorsPerMeter);
                float2 cellId = floor(gridUV);
                float2 cellUV = frac(gridUV);

                // Ground-floor double-height retail/lobby band & solid architectural mullions
                float isMullion = step(cellUV.x, _MullionWidth) + step(1.0 - _MullionWidth * 0.5, cellUV.x)
                                + step(cellUV.y, _MullionWidth * 1.4) + step(1.0 - _MullionWidth * 0.6, cellUV.y);
                isMullion = saturate(isMullion);

                // Parallax 3D Interior Room Mapping inside each window pane!
                float3 viewLocal = float3(
                    abs(N.x) > 0.5 ? V.z * sign(N.x) : V.x * -sign(N.z),
                    V.y,
                    max(abs(dot(V, N)), 0.15)
                );
                float2 roomOffset = (viewLocal.xy / viewLocal.z) * 0.35;
                float2 backWallUV = saturate(cellUV - roomOffset);
                float roomRand = hash21(cellId + floor(i.positionWS.xz * 0.05));

                // Virtual room shading (brighter ceiling, warm office wall, subtle floor shadow)
                half3 roomBase = lerp(half3(0.24, 0.28, 0.34), half3(0.56, 0.58, 0.62), backWallUV.y);
                roomBase *= (0.78 + 0.36 * roomRand);

                // Physical Fresnel sky reflection on curtain-wall glass
                float fres = 0.08 + 0.92 * pow(1.0 - saturate(dot(N, V)), 3.6);
                float3 R = reflect(-V, N);
                half3 skyRefl = lerp(half3(0.58, 0.74, 0.90), half3(0.88, 0.94, 1.0), saturate(R.y * 1.5 + 0.25));
                half3 glassCol = lerp(roomBase * _GlassTint.rgb * 1.35, skyRefl, saturate(fres * 0.82));

                // Specular sunlight glint off skyscraper glass
                float3 H = normalize(mainLight.direction + V);
                float spec = pow(saturate(dot(N, H)), 96.0) * (1.0 - isMullion) * shadow;
                half3 litGlass = glassCol * (0.45 + 0.55 * shadow) + mainLight.color * spec * 1.35;

                // Nighttime / Sunset warm interior room illumination (randomized occupancy per room!)
                float roomLitMask = step(0.42, roomRand) * _NightFactor * (1.0 - isMullion);
                litGlass += _NightWindowColor.rgb * roomLitMask * (0.85 + 0.55 * backWallUV.y);

                // Crisp architectural concrete/stone mullions & spandrels
                half3 frameCol = _BaseColor.rgb * (mainLight.color * NdotL * shadow + skyAmbient);
                half3 finalCol = lerp(litGlass, frameCol, isMullion);

                // Subtle ground contact AO near street level
                float groundAO = saturate(0.75 + i.positionWS.y * 0.015);
                finalCol *= groundAO;

                return half4(MixFog(finalCol, i.fogFactor), 1.0);
            }
            ENDHLSL
        }

        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
    }
}
