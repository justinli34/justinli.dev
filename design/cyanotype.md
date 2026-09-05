# Cyanotype direction

The existing bio, social links, email address, post listing, post contents, and flower-shaped home link are preserved. The design uses pale type on a botanical contact print, subtle paper grain, and uneven blue exposure. The artwork runs to all four screen edges: the outer page margin is removed, and the unexposed paper edges are cropped out in CSS. The narrow text column stays clear of the flowers. A separate portrait composition is used below 900px. The flower home link has no hover animation.

## Floral references

These downloaded historical references are kept for design research; they are not shipped on the website.

- [Anna Atkins, Papaver orientale](https://www.arthistoryproject.com/artists/anna-atkins/papaver-orientale/): translucent petals and a clear white stem against blue. [Local reference](references/anna-atkins-papaver-orientale.jpg).
- [Anna Atkins, Papaver rhoeas](https://photohistory.jeffcurto.com/archives/1789): overlapping flower impressions, winding stems, and soft exposure halos. [Local reference](references/anna-atkins-papaver-rhoeas.jpg).

## Original website artwork

Generated using the built-in imagegen tool. The portrait image uses the desktop artwork as its reference. Astro and Sharp generate responsive WebP files at build time; the original PNGs are retained as source assets.

- [Desktop source](../src/assets/cyanotype-botanical.png)
- [Mobile source](../src/assets/cyanotype-botanical-mobile.png)
- [Cyanotype flower icon source](../src/assets/gloryofthesnow-cyanotype.png)
- [Flower icon and favicon, optimized to 128px](../public/gloryofthesnow.png)
- [Responsive image component](../src/components/CyanotypePaper.astro)

### Flower icon prompt

Generated with the built-in imagegen tool, using the original gloryofthesnow.png as the edit target and the desktop botanical artwork as the style reference. The original six-petal silhouette and orientation are preserved. The output has a real alpha channel and is resized to 128px for the existing icon and favicon path.

Use case: style-transfer. Asset type: a transparent PNG flower icon for a minimal cyanotype website. Image 1 is the EDIT TARGET: the original glory-of-the-snow flower icon. Image 2 is a STYLE REFERENCE ONLY for the authentic botanical cyanotype photogram effect. Recreate ONLY the isolated six-petaled glory-of-the-snow flower in image 1, preserving its recognizable asymmetric pointed petal silhouette, the original orientation, the six-petal anatomy and bright star-shaped central structure. Transform the natural purple and yellow flower into a pale ivory and icy light-blue cyanotype contact-print impression like the flowers in image 2. Retain translucent-looking veined petals, delicate organic mottling and a bright central stamen cluster. Use light pale cyan and warm white only on the flower, with subtle deeper blue fine vein details. It should read clearly at 48 by 48 pixels against a deep Prussian blue site background, with substantially light petals, not a dark blue flower and not a featureless solid silhouette. Transparent background with actual alpha around the flower and in the gaps between petals. No paper, no blue rectangle, no white square, no border, no shadow, no extra plants, no stems, no text. Flower centered in a square canvas filling approximately 90 percent of the width and height. Deliver one high-resolution PNG icon on a genuinely transparent background.

### Desktop prompt

Use case: stylized-concept. Asset type: original decorative background for a very minimal personal website, not a website mockup. Create a high-resolution landscape image, 1536 by 1024, a straight-on flat scan of an authentic hand-exposed floral cyanotype print. A deep rich Prussian blue paper field, approximately #123f79, with subtle natural uneven exposure, pigment pooling and real delicate cotton paper grain. An airy arrangement of white and pale ice-blue photogram impressions of two cosmos flowers, one small umbel flower and delicate thin bending stems rises from the bottom RIGHT edge, confined mostly to the rightmost quarter and bottom quarter of the sheet. Some translucent ghost impressions overlap the crisp petals, soft exposure halos, naturally irregular petals, beautiful tiny organic details. A single small faint fern-like sprig enters from the lower LEFT corner, confined to leftmost 12 percent and bottom third. The top 65 percent of the image across its LEFT 75 percent and the central area MUST remain empty rich dark blue, with extremely subtle mottling only, because website text will overlay it. The blue field reaches close to the edges but has a very narrow irregular hand-brushed border of warm ivory uncoated paper, around 10-20 pixels, on all four sides: frayed pigment edges, uneven brush bristles, wicking into cotton fibers. Restrained poetic archival botanical mood, inspired by historic nineteenth-century botanical cyanotype photograms. It must look like a real contact print, not a vector drawing, not a painting of flowers, not an AI glossy illustration. Overall mostly deep blue negative space with just a few asymmetrical botanical impressions in the margins. No text, no lettering, no watermark, no frame, no mockup shadows, no objects outside the sheet, no gradients or geometric patterns.

### Mobile prompt

Use case: stylized-concept. Create a PORTRAIT responsive companion to the provided original cyanotype print, 1024 pixels wide by 2048 pixels tall. Preserve exactly its authentic deep Prussian blue photogram style, subtle irregular paper grain and blue exposure, and very narrow 10-pixel rough hand-brushed ivory border on ALL four sides. Recompose for a narrow phone screen: leave the ENTIRE TOP 74 PERCENT of the image completely empty dark blue paper, with only extremely subtle exposure mottling and fine paper texture. Absolutely no flowers, leaves, stems or other shapes anywhere in that top 74 percent. Compress the botanical arrangement into the BOTTOM 26 PERCENT of the sheet. Two pale translucent cosmos flower photograms with delicate fine stems and a small umbel flower grow naturally up from bottom RIGHT, all entirely contained below y=1515. A tiny faint sprig in the bottom LEFT. The central and top areas are rich dark indigo blue with restrained fine paper grain. Match the provided print's blues rather than adding a lighter blue gradient. Need a seamless single real-looking scanned sheet, not a collage or two joined images. Fine irregular deckled exposure edges, warm ivory paper shows through only at outer border. No text, no logos, no mockup, no shadows outside the page. A sparse authentic floral contact print with abundant empty blue area for overlaying website text.
