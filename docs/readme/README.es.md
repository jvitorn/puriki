# Puriki

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/brand/svg/puriki-horizontal-dark.svg">
    <img alt="Puriki" src="../../assets/brand/svg/puriki-horizontal-light.svg" width="360">
  </picture>
</p>

<p align="center">
  Un cliente Android gratuito y sin anuncios para listas de anime de AniList y MyAnimeList.
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="./README.pt-BR.md">Português (Brasil)</a> ·
  <strong>Español</strong>
</p>

Puriki ofrece a los fans del anime una experiencia Android enfocada para
descubrir títulos y administrar la lista que ya mantienen en AniList o
MyAnimeList. Conecta uno de los proveedores, elige la lista activa cuando ambos
estén conectados o prueba la aplicación en modo invitado.

[Sitio oficial](https://jvitorn.github.io/puriki-site/) ·
[GitHub Releases](https://github.com/jvitorn/puriki/releases) ·
[Roadmap del producto](../../PURIKI_PRODUCT_ENGINEERING_ROADMAP.md)

## Funciones

- Descubre anime popular, de temporada, próximo y destacado.
- Busca en el catálogo y abre páginas detalladas con sinopsis, estudios,
  géneros, continuidad y dónde ver cada título cuando los proveedores ofrecen
  esos datos.
- Conecta una cuenta de AniList o MyAnimeList.
- Consulta la lista del proveedor seleccionado y añade o elimina títulos.
- Actualiza episodios vistos, estado de la lista y puntuación.
- Mantén el progreso dentro del límite de episodios publicados cuando esa
  información esté disponible.
- Usa una lista temporal en modo invitado sin conectar una cuenta.
- Sigue navegando mediante fallback entre proveedores y caché del catálogo
  durante fallos de servicio elegibles.
- Usa la interfaz en inglés, portugués de Brasil o español.
- Traduce sinopsis en inglés al portugués o español en Android, bajo demanda,
  mediante Google ML Kit en el dispositivo.

Puriki 1.0 administra una lista de proveedor seleccionada a la vez. **No** copia
ni sincroniza continuamente listas entre AniList y MyAnimeList.

## Servicios compatibles

| Servicio      | Datos de descubrimiento          | Conexión de cuenta | Administración de la lista                                   |
| ------------- | -------------------------------- | ------------------ | ------------------------------------------------------------ |
| AniList       | Fuente principal del catálogo    | OAuth              | Lectura, adición, eliminación, progreso, estado y puntuación |
| MyAnimeList   | Fallback automático del catálogo | OAuth con PKCE     | Lectura, adición, eliminación, progreso, estado y puntuación |
| Modo invitado | Usa el catálogo disponible       | No requerida       | Lista temporal durante el proceso de la app                  |

La disponibilidad de los proveedores y la información de cada título dependen
de los datos expuestos por AniList y MyAnimeList.

## Capturas de pantalla

Una vista de Puriki en funcionamiento en Android.

<p align="center">
  <a href="./screenshots/home.png"><img src="./screenshots/home.png" alt="Inicio" width="200"></a>
  <a href="./screenshots/search.png"><img src="./screenshots/search.png" alt="Búsqueda" width="200"></a>
  <a href="./screenshots/anime-details.png"><img src="./screenshots/anime-details.png" alt="Detalles del anime" width="200"></a>
  <a href="./screenshots/my-list.png"><img src="./screenshots/my-list.png" alt="Mi Lista" width="200"></a>
  <a href="./screenshots/settings.png"><img src="./screenshots/settings.png" alt="Configuración" width="200"></a>
</p>

## Descarga

Puriki 1.0 se distribuye directamente como APK para Android. El primer APK
público estará disponible en la página oficial de
[GitHub Releases](https://github.com/jvitorn/puriki/releases) con el nombre:

```text
puriki-v1.0.0.apk
```

Puriki no se distribuye mediante Google Play. La documentación no considera que
la versión esté publicada hasta que existan el GitHub Release y su APK firmado.

## Instalación en Android

1. Descarga el APK desde el GitHub Release oficial de Puriki.
2. Abre el archivo descargado en tu dispositivo Android.
3. Si Android lo solicita, permite instalaciones desde el navegador o gestor de
   archivos utilizado.
4. Confirma la instalación.

Android puede advertir que la aplicación procede de fuera de Google Play.
Comprueba el nombre del archivo y la página del release antes de instalar. Los
APKs futuros pueden instalarse sobre la aplicación actual cuando utilicen la
misma clave de firma y un `android.versionCode` mayor.

## Privacidad y seguridad

- Puriki no tiene un servicio de cuenta propio ni un backend alojado por el
  proyecto con una copia de tu lista de anime.
- Los tokens OAuth de AniList y MyAnimeList se almacenan en el dispositivo con
  Expo SecureStore.
- La build de producción usa únicamente IDs públicos de clientes OAuth. Los
  secretos de cliente no deben incluirse en variables `EXPO_PUBLIC_*` ni en
  la aplicación.
- El idioma, estado del onboarding, proveedor seleccionado, caché de traducción
  y datos operativos similares pueden almacenarse localmente.
- El contenido de la lista de invitado solo existe durante el proceso actual de
  la aplicación y puede perderse cuando se reinicia.
- Puriki 1.0 no incluye SDK de publicidad ni backend propio de analítica.
- La traducción en el dispositivo puede descargar modelos de idioma de Google
  ML Kit, pero el texto de la sinopsis no se envía a un servidor de Puriki.

AniList, MyAnimeList, Google ML Kit, GitHub y EAS son servicios de terceros con
sus propios términos y prácticas de privacidad.

## Tecnología

Puriki utiliza React Native, Expo, TypeScript, Expo Router, React Native
Reanimated, NativeWind, TanStack Query, i18next, Jest y un Expo Module local
para la traducción con ML Kit en Android.

## Arquitectura

La aplicación sigue cuatro límites principales:

- `domain`: modelos independientes del proveedor, contratos de repositorio y
  reglas de negocio.
- `application`: casos de uso, coordinación de autenticación/sesión, mutations
  y puertos de runtime.
- `infrastructure`: APIs de AniList y MyAnimeList, OAuth, almacenamiento,
  caché, resiliencia, repositorios y adaptadores de traducción nativa.
- `presentation`: pantallas de Expo Router, componentes, providers,
  localización e integración con React Query.

La planificación detallada está en el
[roadmap de ingeniería del producto](../../PURIKI_PRODUCT_ENGINEERING_ROADMAP.md),
y el proceso Android reutilizable está en
[docs/RELEASING.md](../RELEASING.md).

## Desarrollo

Requisitos:

- Una versión LTS actual de Node.js y npm.
- Android Studio, Android SDK y un JDK compatible para desarrollo nativo.
- Un emulador o dispositivo Android físico.

Instala las dependencias y crea el archivo de entorno local:

```bash
npm ci
cp .env.example .env
```

Configura los IDs públicos de las aplicaciones según sea necesario:

```env
EXPO_PUBLIC_ANILIST_CLIENT_ID=
EXPO_PUBLIC_MAL_CLIENT_ID=
```

No añadas secretos de cliente. Las URI de retorno OAuth nativas son
`puriki://auth/anilist` y `puriki://auth/mal`.

Inicia Metro:

```bash
npm run start
```

Compila y ejecuta Android:

```bash
npm run android
```

Los retornos OAuth y la traducción de sinopsis en el dispositivo requieren una
build nativa de desarrollo/release; Expo Go no dispone del módulo nativo local.

## Calidad

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
npx expo-doctor
```

Las pruebas usan transports inyectados y fixtures, sin llamar a las APIs reales
de los proveedores.

## Roadmap

La dirección actual y futura del producto está registrada en
[PURIKI_PRODUCT_ENGINEERING_ROADMAP.md](../../PURIKI_PRODUCT_ENGINEERING_ROADMAP.md).
List Sync, la sincronización continua entre proveedores y la infraestructura de
actualización automática de la aplicación son posibilidades futuras, no
funciones de Puriki 1.0.

La información pública del README se mantiene en inglés, portugués de Brasil y
español. Cuando cambien los datos del producto o del lanzamiento, mantén
sincronizadas las tres versiones.

## Aviso

Puriki es un proyecto independiente y no oficial. No está afiliado,
respaldado, patrocinado ni operado por AniList o MyAnimeList. Los nombres y
marcas de los proveedores pertenecen a sus respectivos titulares.

## Licencia

Puriki se distribuye bajo la Licencia MIT. Consulta [LICENSE](../../LICENSE)
para más detalles.

La licencia del código fuente de Puriki no otorga derechos sobre AniList,
MyAnimeList, sus marcas, API, datos, artes u otro contenido de terceros. Esos
elementos siguen sujetos a los términos y licencias de sus respectivos
titulares.
