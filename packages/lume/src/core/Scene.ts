// TODO: write a test that imports public interfaces in every possible
// permutation to detect circular dependency errors.
// See: https://esdiscuss.org/topic/how-to-solve-this-basic-es6-module-circular-dependency-problem

import {autorun, booleanAttribute, attribute, numberAttribute, untrack, element, stringAttribute} from '@lume/element'
import {emits} from '@lume/eventful'
import {Scene as ThreeScene} from 'three/src/scenes/Scene.js'
import {PerspectiveCamera as ThreePerspectiveCamera} from 'three/src/cameras/PerspectiveCamera.js'
// import {AmbientLight} from 'three/src/lights/AmbientLight.js'
import {Color} from 'three/src/math/Color.js'
import {Fog} from 'three/src/scenes/Fog.js'
import {FogExp2} from 'three/src/scenes/FogExp2.js'
import {WebglRendererThree, ShadowMapTypeString} from '../renderers/WebglRendererThree.js'
import {Css3dRendererThree} from '../renderers/Css3dRendererThree.js'
import {HtmlScene as HTMLInterface} from './HtmlScene.js'
import {documentBody, thro, trim} from './utils.js'
import {possiblyPolyfillResizeObserver} from './ResizeObserver.js'
import {isDisposable} from '../utils/three.js'
import {Motor} from './Motor.js'

import type {ImperativeBase} from './ImperativeBase.js'
import type {TColor} from '../utils/three.js'
import type {PerspectiveCamera} from '../cameras/PerspectiveCamera.js'
import type {XYZValuesObject} from '../xyz-values/XYZValues.js'
import type {Sizeable} from './Sizeable.js'
import type {SizeableAttributes} from './Sizeable.js'
import type {TreeNode} from './TreeNode.js'

export type SceneAttributes =
	// Don't expost TransformableAttributes here for now (although they exist). What should modifying those on a Scene do?
	| SizeableAttributes
	| 'shadowmapType'
	| 'vr'
	| 'webgl'
	| 'enableCss'
	| 'backgroundColor'
	| 'backgroundOpacity'
	| 'background'
	| 'equirectangularBackground'
	| 'environment'
	| 'fogMode'
	| 'fogNear'
	| 'fogFar'
	| 'fogColor'
	| 'fogDensity'
	| 'cameraNear'
	| 'cameraFar'
	| 'perspective'

/**
 * @class Scene -
 * > :construction: :hammer: Under construction! :hammer: :construction:
 *
 * This is the backing class for `<lume-scene>` elements. All
 * [`Node`](/api/core/Node.md) elements must be inside of a `<lume-scene>` element. A `Scene`
 * establishes a visual area in a web application where a 3D scene will be
 * rendered.
 *
 * A Scene has some properties that apply to the scene as a whole and will have
 * an effect on all LUME elements in the scene. For example, `fog-mode` defines fog
 * rendering that changes the color of all WebGL objects in the scene to make them
 * have the appearance of being obscured by a haze.
 *
 * ## Example
 *
 * The following example shows how to begin making a LUME scene within an HTML
 * file. To learn more about how to get started, see the [install guide](../../guide/install.md).
 *
 * <div id="example1"></div>
 *
 * <script type="application/javascript">
 *   new Vue({
 *     el: '#example1',
 *     template: '<live-code :template="code" mode="html>iframe" :debounce="200" />',
 *     data: { code: sceneExample() },
 *   })
 * </script>
 *
 * @extends HTMLScene
 */
@element
export class Scene extends HTMLInterface {
	static defaultElementName = 'lume-scene'

	/**
	 * @readonly
	 * @property {true} isNode - Always true for things that are or inherit from `Scene`.
	 */
	readonly isScene = true

	/**
	 * @property {boolean} enableCss - When `true`, CSS transforms are applied
	 * to all LUME elements. This allows regular HTML content placed inside LUME
	 * elements to be positioned in the scene's 3D space. Set this to `false` if
	 * you will render only WebGL content and do not need to listen to
	 * pointer events on the elements; the elements will have the CSS property
	 * `display:none`. When rendering only WebGL content, leaving this enabled is useful for
	 * debugging, as the elements are placed in the same locations in 3D
	 * space as the WebGL graphics, and thus devtools will highlight the
	 * positions of WebGL objects on the screen when hovering on them in the element inspector.
	 * Defaults to `true`.
	 */
	@emits('propertychange') @booleanAttribute(true) enableCss = true

	/** @property {boolean} webgl - When `true`, enables WebGL rendering. Defaults to `false`. */
	@emits('propertychange') @booleanAttribute(false) webgl = false

	/**
	 * @property {'pcf' | 'pcfsoft' | 'basic'} shadowmapType - Specifies the
	 * type of shadows to use. Defaults to `'basic'`.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@emits('propertychange') @attribute shadowmapType: ShadowMapTypeString = 'basic'

	/**
	 * @property {boolean} vr - When `true`, enables VR capabilities. The user
	 * can click a button to enter VR mode.
	 *
	 * Applies only if `webgl` is `true`. CSS content can not be natively
	 * rendered with the browser's WebXR. There exist some tricks to import CSS
	 * rendering in the form of an SVG image to use as a texture in WebGL and
	 * hence WebXR, but it has some limitations including low performance if
	 * animating CSS features; we may add this feature later.
	 */
	@emits('propertychange') @booleanAttribute(false) vr = false

	/**
	 * @property {Color | string | number} backgroundColor - The color of the
	 * scene's background when WebGL rendering is enabled. If the
	 * [`background`](#background) property is also set, then `backgroundColor` is
	 * ignored. Make sure to set `backgroundOpacity` to a higher value than the
	 * default of `0` or the color won't be visible and instead only the color of
	 * whatever is behind the `<lume-scene>` will be visible.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@emits('propertychange') @attribute backgroundColor: TColor = new Color('white')

	/**
	 * @property {number} backgroundOpacity - A number between `0` and `1`
	 * that defines the opacity of the `backgroundColor` WebGL is enabled.
	 * If the value is less than 1, it means that any DOM contend behind
	 * the `<lume-scene>` element will be visible. This is ignored if the
	 * [`background`](#background) property is set.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@emits('propertychange') @numberAttribute(0) backgroundOpacity = 0

	/**
	 * @property {string} background - Set an image as the scene's
	 * background. If the image is an [equirectangular environment
	 * map](https://coeleveld.com/spherical-equirectangular-environment-textures-and-hdri), then set the value of
	 * [`equirectangularBackground`](#equirectangularbackground) to `true`, otherwise the image
	 * will be treated as a 2D background image. The value should be a path
	 * to a jpeg, jpg, or png. Other types not supported yet. This value
	 * takes priority over the [`backgroundColor`](#backgroundcolor) and
	 * [`backgroundOpacity`](#backgroundopacity) properties; those properties will be
	 * ignored. Any transparent parts of the image will be rendered
	 * as color white.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@emits('propertychange') @attribute background = ''

	/**
	 * @property {string} equirectangularBackground - If the `background`
	 * is equirectangular, set this to `true` so use it like a skybox,
	 * otherwise the image will be used as a regular 2D background image.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@emits('propertychange') @booleanAttribute(false) equirectangularBackground = false

	/**
	 * @property {string} environment - The environment can be a path to a
	 * jpeg, jpg, or png (other format not yet supported). It is assumed to
	 * be an equirectangular image used for env maps for things like
	 * reflections on metallic objects in the scene.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@emits('propertychange') @attribute environment = ''

	/**
	 * @property {'none' | 'linear' | 'expo2'} fogMode - The fog mode to render
	 * the scene with.
	 *
	 * A value of `'none'` means no fog.
	 *
	 * A value of `'linear'`
	 * makes a fog that gets reduces visibility of objects with distance from the camera.
	 * The `fogNear` and `fogFar` properties specify the distance from the camera when
	 * linear fog starts being applied to objects and when objects are fully invisible,
	 * respectively. Any objects before the near point will be fully visible, and any
	 * objects beyond the far point will be fully invisible.
	 *
	 * A value of `'expo2'` creates an exponential squared fog. Unlike linear fog, the near
	 * and far cannot be configured. Instead, expo2 fog is more realistic, and only it's
	 * overall "physical" density can be configured with the `fogDensity` property.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@stringAttribute('none') fogMode: FogMode = 'none'

	/**
	 * @property {number} fogNear - When `fogMode` is `'linear'`, this controls
	 * the distance from the camera where fog starts to appear and objects start
	 * to be less visible.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@numberAttribute(0) fogNear = 0

	/**
	 * @property {number} fogFar - When `fogMode` is `'linear'`, this controls
	 * the distance from the camera where fog reaches maximum density and
	 * objects are no longer visible.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@numberAttribute(1000) fogFar = 1000

	/**
	 * @property {string} fogColor - If `fogMode` is not `'none'`, this
	 * configures the fog color. The value should be any valid CSS color string.
	 *
	 * Defaults to `'gray'`, but you will likely want to change the value to
	 * match that of your scene's `backgroundColor`.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@stringAttribute('gray') fogColor: string = 'gray'

	/**
	 * @property {number} fogDensity - If `fogMode` is set to `'expo2'`, this
	 * configures the fog density. Defaults to `0.0025`.
	 *
	 * Applies only if `webgl` is `true`.
	 */
	@numberAttribute(0.0025) fogDensity = 0.0025

	/**
	 * @property {number} cameraNear - When not using a custom camera, this
	 * configures the distance from the default camera of a plane perpendicular
	 * to the camera's line of sight after which objects objects are visible. Anything between
	 * the plane and the camera will not be visible. This should be smaller than `cameraFar`. Also see `cameraFar`.
	 *
	 * Defaults to `0.1`.
	 *
	 * Applies in both CSS and WebGL rendering. Note that the near and far
	 * values apply only to WebGL rendering and are otherwise infinitely small and
	 * infinitely big (respectively) when it comes to CSS rendering.
	 */
	@numberAttribute(0.1) cameraNear = 0.1

	/**
	 * @property {number} cameraFar - When not using a custom camera, this
	 * configures the distance from the default camera of a plane perpendicular
	 * to the camera's line of sight before which objects are visible. Anything further than
	 * the plane will not be visible. This should be bigger than `cameraNear`. Also see `cameraNear`.
	 *
	 * Defaults to `10000`.
	 *
	 * Applies in both CSS and WebGL rendering. Note that the near and far
	 * values apply only to WebGL rendering and are otherwise infinitely small and
	 * infinitely big (respectively) when it comes to CSS rendering.
	 */
	@numberAttribute(10000) cameraFar = 10000

	/**
	 * @property {number} perspective - This property behaves just like CSS perspective
	 * when using CSS transforms, but also applies to LUME's WebGL rendering when using a scene's
	 * default camera. If using a custom camera (for example a `<lume-perspective-camera>` element) then this
	 * value does not (currently) have any effect.
	 *
	 * The value sets the default camera's Z position to the given value (relative to the world
	 * origin, 0,0,0). Note that the default camera points in the -z direction, therefore a value
	 * of 800 means the camera is at position 0,0,800 looking directly at the world origin
	 * at 0,0,0. Furthermore, based on the chosen value, the camera's aspect ratio and zoom
	 * will be adjusted such that if there were a plane positioned at 0,0,0, perpendicular
	 * to the camera's line of sight, and having the same dimensions as the scene's viewport
	 * in screen pixels, then the plane would fit perfectly in the view, and one unit on that
	 * plane would coincide with one pixel on the screen; essentially that plane would be lined
	 * up perfectly with the screen surface. This is the same meaning that CSS perspective has.
	 *
	 * Applies with both CSS and WebGL rendering.
	 */
	@numberAttribute(400)
	set perspective(value) {
		this.#perspective = value
		this._updateCameraPerspective()
		this._updateCameraProjection()
		this.needsUpdate()
	}
	get perspective() {
		return this.#perspective
	}

	#perspective = 400

	/**
	 * @readonly
	 * @property {THREE.Camera} threeCamera - The current active THREE.Camera being
	 * used by the scene. It will be a default camera if no camera was manually
	 * specified by a camera element such as `<lume-perspective-camera>`, in
	 * which case the scene's `perspective` property is used for configuring the
	 * default camera. If a manual camera element is set active with an
	 * `active` attribute, then this property will return the currently
	 * active THREE.Camera represented by the active camera element.
	 *
	 * Applies with both CSS and WebGL rendering.
	 */
	get threeCamera(): ThreePerspectiveCamera {
		return this.#threeCamera
	}

	// this.#threeCamera holds the active camera. There can be many
	// cameras in the scene tree, but the last one with active="true"
	// will be the one referenced here.
	// If there are no cameras in the tree, a virtual default camera is
	// referenced here, who's perspective is that of the scene's
	// perspective attribute.
	#threeCamera!: ThreePerspectiveCamera

	// Used by the `scene` getter in ImperativeBase
	_scene: this | null = this

	constructor() {
		super()

		// this.sizeMode and this.size have to be overriden here inside the
		// constructor in TS 4. This is because class fields on a
		// subclass are no longer allowed to be defined outside the
		// constructor if a base class has the same properties already defined as
		// accessors.

		/**
		 * @override
		 * @property {XYZSizeModeValues} sizeMode - This overrides the
		 * [`Sizeable.sizeMode`](/api/core/Sizeable.md#sizeMode) property to make the default values for the X and
		 * Y axes both "proportional".
		 */
		this.sizeMode.set('proportional', 'proportional', 'literal')

		/**
		 * @override
		 *
		 * @property {XYZNonNegativeValues} size - This overrides the
		 * [`Sizeable.size`](/api/core/Sizeable.md#size) property to make the default values for the
		 * X and Y axes both `1`.
		 */
		this.size.set(1, 1, 0)

		// The scene should always render CSS properties (it needs to always
		// be rendered or resized, for example, because it contains the
		// WebGL canvas which also needs to be resized). Namely, we still
		// want to apply size values to the scene so that it can size
		// relative to it's parent container, or literally if size mode is
		// "literal".
		this._elementOperations.shouldRender = true

		// size of the element where the Scene is mounted
		// NOTE: z size is always 0, since native DOM elements are always flat.
		this._elementParentSize = {x: 0, y: 0, z: 0}

		this._createDefaultCamera()

		this._calcSize()
		this.needsUpdate()
	}

	drawScene() {
		this.#glRenderer && this.#glRenderer.drawScene(this)
		this.#cssRenderer && this.#cssRenderer.drawScene(this)
	}

	/**
	 * @method mount - Mount the scene into the given target.
	 *
	 * @param {string|HTMLElement} [mountPoint=document.body] If a string selector is provided,
	 * the mount point will be selected from the DOM. If an HTMLElement is
	 * provided, that will be the mount point. If no mount point is provided,
	 * the scene will be mounted into document.body (possibly waiting for the body to
	 * exist if it does not yet exist).
	 */
	async mount(mountPoint?: string | HTMLElement) {
		let _mountPoint: string | Element | null | undefined = mountPoint

		// if no mountPoint was provided, just mount onto the <body> element.
		if (_mountPoint === undefined) {
			if (!document.body) await documentBody()
			_mountPoint = document.body
		}

		// if the user supplied a selector, mount there.
		else if (typeof _mountPoint === 'string') {
			const selector = _mountPoint

			_mountPoint = document.querySelector(selector)
			if (!_mountPoint && document.readyState === 'loading') {
				// maybe the element wasn't parsed yet, check again when the
				// document is ready.
				await documentReady()
				_mountPoint = document.querySelector(selector)
			}
		}

		// At this point we should have an actual mount point (the user may have passed it in)
		if (!(_mountPoint instanceof HTMLElement || _mountPoint instanceof ShadowRoot)) {
			throw new Error(
				trim(`
						Invalid mount point specified in Scene.mount() call
						(${_mountPoint}). Pass a selector or an HTMLElement. Not
						passing any argument will cause the Scene to be mounted
						to the <body>.
					`),
			)
		}

		// The user can mount to a new location without calling unmount
		// first. Call it automatically in that case.
		if (this._mounted) this.unmount()

		if (_mountPoint !== this.parentNode) _mountPoint.appendChild(this)

		this._mounted = true
	}

	/**
	 * @method unmount - Unmount the scene from it's mount point. Use this when you are done using a scene.
	 */
	// TODO we can remove this. Use standard DOM APIs like `remove()` and
	// replace use of `_mounted` with the standard `isConnected` property.
	unmount() {
		if (!this._mounted) return

		if (this.parentNode) this.parentNode.removeChild(this)

		this._mounted = false
	}

	connectedCallback() {
		super.connectedCallback()

		this._stopFns.push(
			autorun(() => {
				if (this.webgl) this._triggerLoadGL()
				else this._triggerUnloadGL()

				// TODO Need this?
				this.needsUpdate()
			}),
			autorun(() => {
				if (!this.webgl || !this.background) {
					if (isDisposable(this.three.background)) this.three.background.dispose()
					this.#glRenderer?.disableBackground(this)
					return
				}

				if (this.background.match(/\.(jpg|jpeg|png)$/)) {
					// Dispose each time we switch to a new one.
					if (isDisposable(this.three.background)) this.three.background.dispose()

					// destroy the previous one, if any.
					this.#glRenderer!.disableBackground(this)

					this.#glRenderer!.enableBackground(this, this.equirectangularBackground, texture => {
						this.three.background = texture || null
						this.needsUpdate()

						// TODO emit background load event.
					})
				} else {
					console.warn(
						`<${this.tagName.toLowerCase()}> background attribute ignored, the given image type is not currently supported.`,
					)
				}
			}),
			autorun(() => {
				if (!this.webgl || !this.environment) {
					if (isDisposable(this.three.environment)) this.three.environment.dispose()
					this.#glRenderer?.disableEnvironment(this)
					return
				}

				if (this.environment.match(/\.(jpg|jpeg|png)$/)) {
					// Dispose each time we switch to a new one.
					if (isDisposable(this.three.environment)) this.three.environment.dispose()

					// destroy the previous one, if any.
					this.#glRenderer!.disableEnvironment(this)

					this.#glRenderer!.enableEnvironment(this, texture => {
						this.three.environment = texture
						this.needsUpdate()

						// TODO emit background load event.
					})
				} else {
					console.warn(
						`<${this.tagName.toLowerCase()}> environment attribute ignored, the given image type is not currently supported.`,
					)
				}
			}),
			autorun(() => {
				if (this.enableCss) this._triggerLoadCSS()
				else this._triggerUnloadCSS()

				// Do we need this? Doesn't hurt to have it just in case.
				this.needsUpdate()
			}),
			autorun(() => {
				this.sizeMode
				this.#startOrStopParentSizeObservation()
			}),
		)
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		this.#stopParentSizeObservation()
	}

	_mounted = false
	_elementParentSize: XYZValuesObject<number>

	makeThreeObject3d() {
		return new ThreeScene()
	}

	makeThreeCSSObject() {
		return new ThreeScene()
	}

	_createDefaultCamera() {
		// Use untrack so this method is non-reactive.
		untrack(() => {
			const size = this.calculatedSize
			// THREE-COORDS-TO-DOM-COORDS
			// We apply Three perspective the same way as CSS3D perspective here.
			// TODO CAMERA-DEFAULTS, get defaults from somewhere common.
			// TODO the "far" arg will be auto-calculated to encompass the furthest objects (like CSS3D).
			// TODO update with calculatedSize in autorun
			this.#threeCamera = new ThreePerspectiveCamera(45, size.x / size.y || 1, 0.1, 10000)
			this.perspective = this.perspective
		})
	}

	// TODO can this be moved to a render task like _calcSize should also be?
	// It depends on size values.
	_updateCameraPerspective() {
		const perspective = this.#perspective

		// This math is what sets the FOV of the default camera so that a
		// viewport-sized plane will fit exactly within the view when it is
		// positioned at the world origin, as described for in the
		// `perspective` property's description.
		// For more details: https://discourse.threejs.org/t/269/28
		this.#threeCamera.fov = (180 * (2 * Math.atan(this.calculatedSize.y / 2 / perspective))) / Math.PI

		this.#threeCamera.position.z = perspective
	}

	_updateCameraAspect() {
		this.#threeCamera.aspect = this.calculatedSize.x / this.calculatedSize.y || 1
	}

	_updateCameraProjection() {
		this.#threeCamera.updateProjectionMatrix()
	}

	// holds active cameras found in the DOM tree (if this is empty, it
	// means no camera elements are in the DOM, but this.#threeCamera
	// will still have a reference to the default camera that scenes
	// are rendered with when no camera elements exist).
	#activeCameras: Set<PerspectiveCamera> = new Set()

	_addCamera(camera: PerspectiveCamera) {
		this.#activeCameras.add(camera)
		this.#setCamera(camera)
	}

	_removeCamera(camera: PerspectiveCamera) {
		this.#activeCameras.delete(camera)

		if (this.#activeCameras.size) {
			// get the last camera in the Set
			this.#activeCameras.forEach(c => (camera = c))
			this.#setCamera(camera)
		} else {
			this.#setCamera()
		}
	}

	/** @override */
	_getParentSize(): XYZValuesObject<number> {
		return this.parent ? (this.parent as Sizeable).calculatedSize : this._elementParentSize
	}

	// For now, use the same program (with shaders) for all objects.
	// Basically it has position, frag colors, point light, directional
	// light, and ambient light.
	_loadGL() {
		// THREE
		// maybe keep this in sceneState in WebGLRendererThree
		if (!super._loadGL()) return false

		this._composedChildren

		// We don't let Three update any matrices, we supply our own world
		// matrices.
		this.three.autoUpdate = false

		// TODO: default ambient light when no AmbientLight elements are
		// present in the Scene.
		//const ambientLight = new AmbientLight( 0x353535 )
		//this.three.add( ambientLight )

		this.#glRenderer = this.#getGLRenderer('three')

		// If _loadGL is firing, then this.webgl must be true, therefore
		// this.#glRenderer must be defined in any of the below autoruns.

		this._glStopFns.push(
			autorun(() => {
				if (this.fogMode === 'none') {
					this.three.fog = null
				} else if (this.fogMode === 'linear') {
					this.three.fog = new Fog('deeppink')
				} else if (this.fogMode === 'expo2') {
					this.three.fog = new FogExp2(new Color('deeppink').getHex())
				}

				this.needsUpdate()
			}),
			autorun(() => {
				if (this.fogMode === 'none') {
					// Nothing to do.
				} else if (this.fogMode === 'linear') {
					const fog = this.three.fog! as Fog
					fog.near = this.fogNear
					fog.far = this.fogFar
					fog.color.set(this.fogColor)
				} else if (this.fogMode === 'expo2') {
					const fog = this.three.fog! as FogExp2
					fog.color.set(this.fogColor)
					fog.density = this.fogDensity
				}
			}),
			autorun(() => {
				this.#glRenderer!.setClearColor(this, this.backgroundColor, this.backgroundOpacity)
				this.needsUpdate()
			}),
			autorun(() => {
				this.#glRenderer!.setClearAlpha(this, this.backgroundOpacity)
				this.needsUpdate()
			}),
			autorun(() => {
				this.#glRenderer!.setShadowMapType(this, this.shadowmapType)
				this.needsUpdate()
			}),
			autorun(() => {
				console.log('enable vr', this.vr)

				this.#glRenderer!.enableVR(this, this.vr)

				if (this.vr) {
					console.log('set vr frame requester!')

					Motor.setFrameRequester(fn => {
						this.#glRenderer!.requestFrame(this, fn)

						// Mock rAF return value for Motor.setFrameRequester.
						return 0
					})

					const button = this.#glRenderer!.createDefaultVRButton(this)
					button.classList.add('vrButton')

					this._miscLayer!.appendChild(button)
				} else if ((this as any).xr) {
					// TODO
				} else {
					// TODO else exit the WebXR headset, return back to normal requestAnimationFrame.
				}
			}),
			autorun(() => {
				this.#threeCamera.near = this.cameraNear
				this.#threeCamera.far = this.cameraFar
				this.needsUpdate()
			}),
		)

		this.traverse((node: TreeNode) => {
			// skip `this`, we already handled it above
			if (node === this) return

			if (isImperativeBase(node)) node._triggerLoadGL()
		})

		return true
	}

	static css = /*css*/ `
		${HTMLInterface.css}
		.vrButton {
			color: black;
			border-color: black;
		}
	`

	_unloadGL() {
		if (!super._unloadGL()) return false

		if (this.#glRenderer) {
			this.#glRenderer.uninitialize(this)
			this.#glRenderer = null
		}

		this.traverse((node: TreeNode) => {
			// skip `this`, we already handled it above
			if (node === this) return

			if (isImperativeBase(node)) node._triggerUnloadGL()
		})

		// Not all things are loaded in _loadGL (they may be loaded
		// depending on property/attribute values), but all things, if any, should
		// still be disposed in _unloadGL.
		{
			this.three.environment?.dispose()
			if (isDisposable(this.three.background)) this.three.background.dispose()
		}

		return true
	}

	_loadCSS() {
		if (!super._loadCSS()) return false

		this.#cssRenderer = this.#getCSSRenderer('three')

		this.traverse((node: TreeNode) => {
			// skip `this`, we already handled it above
			if (node === this) return

			if (isImperativeBase(node)) node._loadCSS()
		})

		return true
	}

	_unloadCSS() {
		if (!super._unloadCSS()) return false

		if (this.#cssRenderer) {
			this.#cssRenderer.uninitialize(this)
			this.#cssRenderer = null
		}

		this.traverse((node: TreeNode) => {
			// skip `this`, we already handled it above
			if (node === this) return

			if (isImperativeBase(node)) node._unloadCSS()
		})

		return true
	}

	#glRenderer: WebglRendererThree | null = null
	#cssRenderer: Css3dRendererThree | null = null

	// The idea here is that in the future we might have "babylon",
	// "playcanvas", etc, on a per scene basis. We'd needed to abstract the
	// renderer more, have abstract base classes to define the common
	// interfaces.
	#getGLRenderer(type: 'three'): WebglRendererThree {
		if (this.#glRenderer) return this.#glRenderer

		let renderer: WebglRendererThree

		if (type === 'three') renderer = WebglRendererThree.singleton()
		else throw new Error('invalid WebGL renderer')

		renderer.initialize(this)

		return renderer
	}

	#getCSSRenderer(type: 'three') {
		if (this.#cssRenderer) return this.#cssRenderer

		let renderer: Css3dRendererThree

		if (type === 'three') renderer = Css3dRendererThree.singleton()
		else throw new Error('invalid CSS renderer. The only type supported is currently "three" (i.e. Three.js).')

		renderer.initialize(this)

		return renderer
	}

	#setCamera(camera?: PerspectiveCamera) {
		if (!camera) {
			this._createDefaultCamera()
		} else {
			// TODO?: implement an changecamera event/method and emit/call
			// that here, then move this logic to the renderer
			// handler/method?
			this.#threeCamera = camera.three
			this._updateCameraAspect()
			this._updateCameraProjection()
			this.needsUpdate()
		}
	}

	// TODO move the following parent size change stuff to a separate re-usable class.

	#parentSize: XYZValuesObject<number> = {x: 0, y: 0, z: 0}

	// HTM-API
	#startOrStopParentSizeObservation() {
		if (
			// If we will be rendering something...
			(this.enableCss || this.webgl) &&
			// ...and if one size dimension is proportional...
			(this.sizeMode.x == 'proportional' || this.sizeMode.y == 'proportional')
			// Note, we don't care about the Z dimension, because Scenes are flat surfaces.
		) {
			// ...then observe the parent element size (it may not be a LUME
			// element, so we observe with ResizeObserver).
			this.#startParentSizeObservation()
		} else {
			this.#stopParentSizeObservation()
		}
	}

	#resizeObserver: ResizeObserver | null = null

	// observe size changes on the scene element.
	// HTM-API
	#startParentSizeObservation() {
		const parent =
			this.parentNode instanceof HTMLElement
				? this.parentNode
				: this.parentNode instanceof ShadowRoot
				? this.parentNode.host
				: thro('A Scene can only be child of an HTMLElement or ShadowRoot (and f.e. not an SVGElement).')

		// TODO use a single ResizeObserver for all scenes.

		possiblyPolyfillResizeObserver()

		this.#resizeObserver = new ResizeObserver(changes => {
			for (const change of changes) {
				// Use the newer API if available.
				// NOTE We care about the contentBoxSize (not the
				// borderBoxSize) because the content box is the area in
				// which we're rendering visuals.
				if (change.contentBoxSize) {
					// If change.contentBoxSize is an array with more than
					// one item, it means the observed element is split
					// across multiple CSS columns.
					//
					// TODO If the Scene is used as display:inline{-block},
					// ensure that it is the size of the column in which it is
					// located. For now, we only grab the first item in the
					// array, assuming that the Scene in not used inside a
					// layout with columns.
					const {inlineSize, blockSize} = change.contentBoxSize[0]

					const isHorizontal = getComputedStyle(parent).writingMode.includes('horizontal')

					// If the text writing mode is horizontal, then inlinSize is
					// the width, otherwise in vertical writing mode it is the height.
					// For more details: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/contentBoxSize#Syntax
					if (isHorizontal) this.#checkSize(inlineSize, blockSize)
					else this.#checkSize(blockSize, inlineSize)
				}
				// Otherwise use the older API (possibly polyfilled)
				else {
					const {width, height} = change.contentRect
					this.#checkSize(width, height)
				}
			}
		})

		this.#resizeObserver.observe(parent)
	}

	// HTM-API
	#stopParentSizeObservation() {
		this.#resizeObserver?.disconnect()
		this.#resizeObserver = null
	}

	// NOTE, the Z dimension of a scene doesn't matter, it's a flat plane, so
	// we haven't taken that into consideration here.
	// HTM-API
	#checkSize(x: number, y: number) {
		const parentSize = this.#parentSize

		// if we have a size change, emit parentsizechange
		if (parentSize.x != x || parentSize.y != y) {
			parentSize.x = x
			parentSize.y = y

			this.#onElementParentSizeChange(parentSize)
		}
	}

	// HTM-API
	#onElementParentSizeChange(newSize: XYZValuesObject<number>) {
		this._elementParentSize = newSize
		// TODO #66 defer _calcSize to an animation frame (via needsUpdate),
		// unless explicitly requested by a user (f.e. they read a prop so
		// the size must be calculated). https://github.com/lume/lume/issues/66
		this._calcSize()
		this.needsUpdate()
	}
}

function isImperativeBase(_n: TreeNode): _n is ImperativeBase {
	// TODO make sure instanceof works. For all intents and purposes, we assume
	// to always have an ImperativeNode where we use this.
	// return n instanceof ImperativeBase
	return true
}

import type {ElementAttributes} from '@lume/element'

declare module '@lume/element' {
	namespace JSX {
		interface IntrinsicElements {
			'lume-scene': ElementAttributes<Scene, SceneAttributes>
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'lume-scene': Scene
	}
}

function documentReady() {
	if (document.readyState === 'loading') {
		return new Promise<void>(resolve => {
			document.addEventListener('DOMContentLoaded', () => resolve())
		})
	}

	return Promise.resolve()
}

type FogMode = 'none' | 'linear' | 'expo2'
