package expo.modules.purikukitranslation

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

data class TranslationRequest(
  @Field val text: String = "",
  @Field val sourceLanguage: String = "",
  @Field val targetLanguage: String = "",
  @Field val wifiOnly: Boolean = false
) : Record

class PurikukiTranslationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PurikukiTranslation")

    AsyncFunction("translateAsync") { request: TranslationRequest, promise: Promise ->
      if (request.text.isBlank()) {
        promise.reject("ERR_EMPTY_TEXT", "Translation text must not be empty.", null)
        return@AsyncFunction
      }

      val sourceLanguage = sourceLanguageTag(request.sourceLanguage)
      val targetLanguage = targetLanguageTag(request.targetLanguage)
      if (sourceLanguage == null || targetLanguage == null) {
        promise.reject("ERR_UNSUPPORTED_LANGUAGE", "Unsupported translation language.", null)
        return@AsyncFunction
      }
      if (sourceLanguage == targetLanguage) {
        promise.reject("ERR_SAME_LANGUAGE", "Source and target languages must differ.", null)
        return@AsyncFunction
      }

      val options = TranslatorOptions.Builder()
        .setSourceLanguage(sourceLanguage)
        .setTargetLanguage(targetLanguage)
        .build()
      val translator = Translation.getClient(options)
      val conditions = DownloadConditions.Builder().apply {
        if (request.wifiOnly) requireWifi()
      }.build()

      try {
        translator.downloadModelIfNeeded(conditions)
          .addOnSuccessListener {
            translate(request.text, translator, promise, sourceLanguage, targetLanguage)
          }
          .addOnFailureListener { error ->
            try {
              promise.reject(
                "ERR_MODEL_DOWNLOAD_FAILED",
                "The translation model could not be downloaded.",
                error
              )
            } finally {
              translator.close()
            }
          }
      } catch (error: Exception) {
        try {
          promise.reject(
            "ERR_MODEL_DOWNLOAD_FAILED",
            "The translation model could not be downloaded.",
            error
          )
        } finally {
          translator.close()
        }
      }
    }
  }

  private fun translate(
    text: String,
    translator: Translator,
    promise: Promise,
    sourceLanguage: String,
    targetLanguage: String
  ) {
    try {
      translator.translate(text)
        .addOnSuccessListener { translatedText ->
          try {
            if (translatedText.isBlank()) {
              deleteDownloadedModels(sourceLanguage, targetLanguage)
              promise.reject("ERR_EMPTY_TRANSLATION", "Translation result was empty.", null)
            } else {
              promise.resolve(mapOf("translatedText" to translatedText))
            }
          } finally {
            translator.close()
          }
        }
        .addOnFailureListener { error ->
          deleteDownloadedModels(sourceLanguage, targetLanguage)
          try {
            promise.reject("ERR_TRANSLATION_FAILED", "Translation failed.", error)
          } finally {
            translator.close()
          }
        }
    } catch (error: Exception) {
      deleteDownloadedModels(sourceLanguage, targetLanguage)
      try {
        promise.reject("ERR_TRANSLATION_FAILED", "Translation failed.", error)
      } finally {
        translator.close()
      }
    }
  }

  /**
   * A model that finished downloading can still have corrupted files on disk
   * (e.g. an interrupted write). ML Kit then reports the model as already
   * present forever, so every future translation keeps failing the exact
   * same way with no way to recover. Deleting the model here forces a clean
   * re-download on the next attempt instead of leaving translation broken
   * permanently.
   */
  private fun deleteDownloadedModels(sourceLanguage: String, targetLanguage: String) {
    val modelManager = RemoteModelManager.getInstance()
    for (language in setOf(sourceLanguage, targetLanguage)) {
      modelManager.deleteDownloadedModel(TranslateRemoteModel.Builder(language).build())
    }
  }

  private fun sourceLanguageTag(tag: String): String? = when (tag) {
    "en" -> TranslateLanguage.ENGLISH
    else -> null
  }

  private fun targetLanguageTag(tag: String): String? = when (tag) {
    "pt" -> TranslateLanguage.PORTUGUESE
    "es" -> TranslateLanguage.SPANISH
    else -> null
  }
}
