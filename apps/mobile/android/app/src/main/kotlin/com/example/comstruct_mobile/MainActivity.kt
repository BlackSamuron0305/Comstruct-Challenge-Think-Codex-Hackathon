package com.example.comstruct_mobile

import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL = "comstruct/local_llm"
        private const val TAG = "ComstructLocalLlm"
        private val MODEL_FILE_NAMES = listOf(
            "gemma-3-1b-it-int4.task",
            "gemma3-1b-it-int4.task",
            "gemma3-1b-it-int4.litertlm"
        )

        @Volatile
        private var inference: LlmInference? = null

        @Volatile
        private var loadedModelPath: String? = null
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "status" -> result.success(modelStatus())
                    "generate" -> {
                        val prompt = call.argument<String>("prompt")?.trim().orEmpty()
                        val systemPrompt = call.argument<String>("systemPrompt")?.trim().orEmpty()
                        val maxTokens = (call.argument<Int>("maxTokens") ?: 256).coerceIn(64, 1024)
                        val temperature = ((call.argument<Double>("temperature") ?: 0.2).toFloat()).coerceIn(0f, 1f)

                        if (prompt.isBlank()) {
                            result.error("empty_prompt", "Prompt cannot be empty.", null)
                            return@setMethodCallHandler
                        }

                        Thread {
                            try {
                                val response = generateWithLocalModel(prompt, systemPrompt, maxTokens)
                                runOnUiThread {
                                    result.success(
                                        mapOf(
                                            "text" to response,
                                            "source" to "local",
                                            "modelReady" to true,
                                            "modelPath" to loadedModelPath
                                        )
                                    )
                                }
                            } catch (t: Throwable) {
                                Log.e(TAG, "Local generation failed", t)
                                runOnUiThread {
                                    result.error(
                                        "local_model_error",
                                        t.message ?: "Local model generation failed.",
                                        modelStatus()
                                    )
                                }
                            }
                        }.start()
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun modelStatus(): Map<String, Any?> {
        val modelPath = resolveModelPath()
        return mapOf(
            "bridgeAvailable" to true,
            "modelName" to MODEL_FILE_NAMES.first(),
            "modelPath" to modelPath,
            "modelReady" to (modelPath != null)
        )
    }

    @Synchronized
    private fun getOrCreateInference(maxTokens: Int): LlmInference {
        val modelPath = resolveModelPath()
            ?: throw IllegalStateException(
                "No local Gemma model file was found. Push one of ${MODEL_FILE_NAMES.joinToString()} to /data/local/tmp/llm/ or add it under assets/models/."
            )

        if (inference != null && loadedModelPath == modelPath) {
            return inference!!
        }

        inference?.close()
        val options = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelPath)
            .setMaxTokens(maxTokens)
            .build()

        inference = LlmInference.createFromOptions(applicationContext, options)
        loadedModelPath = modelPath
        return inference!!
    }

    private fun generateWithLocalModel(
        prompt: String,
        systemPrompt: String,
        maxTokens: Int
    ): String {
        val fullPrompt = if (systemPrompt.isBlank()) prompt else "$systemPrompt\n\n$prompt"
        return getOrCreateInference(maxTokens).generateResponse(fullPrompt).trim()
    }

    private fun resolveModelPath(): String? {
        val candidates = mutableListOf<File>()

        copyBundledModelIfPresent()?.let { candidates.add(File(it)) }
        for (name in MODEL_FILE_NAMES) {
            candidates.add(File(filesDir, "models/$name"))
            getExternalFilesDir(null)?.let { candidates.add(File(it, "models/$name")) }
            candidates.add(File("/data/local/tmp/llm/$name"))
            candidates.add(File("/sdcard/Download/$name"))
        }

        return candidates.firstOrNull { it.exists() && it.isFile && it.length() > 0 }?.absolutePath
    }

    private fun copyBundledModelIfPresent(): String? {
        val targetDir = File(filesDir, "models").apply { mkdirs() }

        for (name in MODEL_FILE_NAMES) {
            val targetFile = File(targetDir, name)
            if (targetFile.exists() && targetFile.length() > 0) {
                return targetFile.absolutePath
            }

            try {
                assets.open("flutter_assets/assets/models/$name").use { input ->
                    targetFile.outputStream().use { output -> input.copyTo(output) }
                }
                return targetFile.absolutePath
            } catch (_: Exception) {
                // Try the next possible bundled file name.
            }
        }

        return null
    }
}
