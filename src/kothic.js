/**
 * @preserve Copyright (c) 2011, Darafei Praliaskouski, Vladimir Agafonkin, Maksim Gurtovenko
 * Kothic JS is a full-featured JavaScript map rendering engine using HTML5 Canvas.
 * See http://github.com/kothic/kothic-js for more information.
 */
Kothic = K.Class.extend({
    options: {
        buffered: false,
        useCanvasProxy: false,
        styles: [],
        locales: []
    }, 
    
    initialize: function (options) {
        K.Utils.setOptions(this, options);
        MapCSS.locales = this.options.locales;
    },
    
    render: function (canvasOrId, data, zoom, onRenderComplete) {
        var canvas = new Kothic.Canvas(canvasOrId, {
            buffererd: this.options.buffered,
            useCanvasProxy: this.options.useCanvasProxy
        });
        
		var width = canvas.width, height = canvas.height,
            granularity = data.granularity,
            ws = width / granularity, hs = height / granularity, 
            ctx = canvas.ctx,
            styles = this.options.styles;

        this.collisionBuffer = new Kothic.CollisionBuffer(height, width);
                
        var trace = new Kothic.Debug();

        //Setup layer styles
		var layers = this._populateLayers(data.features, zoom, styles);
        var layerIds = Kothic.utils.getOrderedKeys(layers);
        trace.addEvent("layers styled: " + MapCSS.debug.hit + "/" + MapCSS.debug.miss);
        MapCSS.debug.miss = 0;
        MapCSS.debug.hit = 0;

		//Render the map
		Kothic.style.setStyles(ctx, Kothic.style.defaultCanvasStyles);

        var v = this;

		var renderIconsAndText = function () {
            v._renderTextAndIcons(layerIds, layers, ctx, ws, hs);
            trace.addEvent("labels rendered");

            canvas.completeRendering();
            trace.addEvent("buffer was copied");

			onRenderComplete(trace);
		};

		var renderMap = function () {
			v._renderBackground(ctx, width, height, zoom, styles);

            var stats = v._renderGeometryFeatures(layerIds, layers, ctx, ws, hs, granularity);
            
            trace.addEvent("geometry rendered");
            trace.setStats(stats);
            
			setTimeout(renderIconsAndText, 0);
		};


		setTimeout(renderMap, 0);
    },
    
    // Private functions
    _populateLayers: function (features, zoom, styles) {
        var layers = {}, i, len;
        
		var styledFeatures = Kothic.style.styleFeatures(features, zoom, styles);

		for (i = 0, len = styledFeatures.length; i < len; i++) {
			var feature = styledFeatures[i],
					layerId = parseFloat(feature.properties.layer) || 0,
					layerStyle = feature.style["-x-mapnik-layer"];

			if (layerStyle === "top") {
				layerId = 10000;
			}
			if (layerStyle === "bottom") {
				layerId = -10000;
			}
			if (!layers.hasOwnProperty(layerId)) {
				layers[layerId] = [];
			}
			layers[layerId].push(feature);
		}

        return layers;
    },

    _renderBackground: function (ctx, width, height, zoom, styles) {
		var style = MapCSS.restyle(styles, {}, {}, zoom, "canvas", "canvas"),
            style_names = Kothic.utils.getOrderedKeys(style),
            i;
        
        var fillRect = function () {
            ctx.fillRect(-1, -1, width + 1, height + 1);
        };
        
        for (i = 0; i < style_names.length; i++) {
            Kothic.polygon.fill(ctx, style[style_names[i]], fillRect);
        }
	},
    
    _renderGeometryFeatures: function (layerIds, layers, ctx, ws, hs, granularity) {
        var polygons = 0, lines = 0, casings = 0, j, i;
        
        for (i = 0; i < layerIds.length; i++) {
            var features = layers[layerIds[i]], featuresLen = features.length;

            // Render polygon
            for (j = 0; j < featuresLen; j++) {
                var style = features[j].style;
                if (style.hasOwnProperty('fill-color') || style.hasOwnProperty('fill-image')) {
                    Kothic.polygon.render(ctx, features[j], features[j + 1], ws, hs, granularity);
                    polygons += 1;
                }
            }

            // Render line casing
            ctx.lineCap = "butt";
            for (j = 0; j < featuresLen; j++) {
                if (features[j].style.hasOwnProperty("casing-width")) {
                    Kothic.line.renderCasing(ctx, features[j], features[j + 1], ws, hs, granularity);
                    casings += 1;
                }
            }

            //Render line
            ctx.lineCap = "round";
            for (j = 0; j < featuresLen; j++) {
                if (features[j].style.width) {
                    Kothic.line.render(ctx, features[j], features[j + 1], ws, hs, granularity);
                    lines += 1;
                }
            }
        }
        
        return {
            'polygons rendered ': polygons, 
            'lines rendered ': lines, 
            'casings rendered ': casings
        };
            
    },
    
    _renderTextAndIcons: function (layerIds, layers, ctx, ws, hs) {
        //TODO: Move to the features detector
        var textOnCanvasAvailable = ctx.strokeText && ctx.fillText && ctx.measureText;
        var icons = 0, labels = 0, shields = 0, j, style, i;

        for (i = 0; i < layerIds.length; i++) {
            var features = layers[layerIds[i]], featuresLen = features.length;

            // render icons without text
            for (j = featuresLen - 1; j >= 0; j--) {
                style = features[j].style;
                if (style.hasOwnProperty('icon-image') && !style.text) {
                    Kothic.texticons.render(ctx, features[j], this.collisionBuffer, ws, hs, false, true);
                    icons += 1;
                }
            }

            // render text on features without icons
            for (j = featuresLen - 1; textOnCanvasAvailable && j >= 0; j--) {
                style = features[j].style;
                if (!style.hasOwnProperty('icon-image') && style.text) {
                    Kothic.texticons.render(ctx, features[j], this.collisionBuffer, ws, hs, true, false);
                    labels += 1;
                }
            }

            // for features with both icon and text, render both or neither
            for (j = featuresLen - 1; j >= 0; j--) {
                style = features[j].style;
                if (style.hasOwnProperty('icon-image') && style.text) {
                    Kothic.texticons.render(ctx, features[j], this.collisionBuffer, ws, hs, textOnCanvasAvailable, true);
                    icons += 1;
                    labels += 1;
                }
            }

            // render shields with text
            for (j = featuresLen - 1; textOnCanvasAvailable && j >= 0; j--) {
                style = features[j].style;
                if (style["shield-text"]) {
                    Kothic.shields.render(ctx, features[j], this.collisionBuffer, ws, hs);
                    shields += 1;
                }
            }
        }

        return {
            'icons rendered ': icons, 
            'labels rendered ': labels, 
            'shields rendered ': shields
        };
    }
});
