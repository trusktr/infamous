import {Object3D} from 'three/src/core/Object3D.js'
import {reactive, StopFunction, autorun, untrack, element} from '@lume/element'
import {Transformable} from './Transformable.js'
import {ElementOperations} from './ElementOperations.js'
import {Motor} from './Motor.js'
import {CSS3DObjectNested} from '../lib/three/CSS3DRendererNested.js'
import {disposeObject} from '../utils/three.js'
import {Events} from './Events.js'
import {Settable} from '../utils/Settable.js'
import {defer, toRadians} from './utils.js'

import type {Node} from './Node.js'
import type {Scene} from './Scene.js'
import type {ConnectionType} from './DeclarativeBase.js'
import type {TransformableAttributes} from './Transformable.js'

// The following isScene and isNode functions are used in order to avoid using
// instanceof, which would mean that we would need to import Node and Scene as
// references, which would cause a circular depdency problem. The problem exists
// only when compiling to CommonJS modules, where the initImperativeBase trick
// won't work because functions don't hoiste in CommonJS like they do with
// ES-Module-compliant builds like with Webpack. We can look into the "internal
// module" pattern to solve the issue if we wish to switch back to using
// instanceof:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

function isScene(s: ImperativeBase): s is Scene {
	return s.isScene
}

function isNode(n: ImperativeBase): n is Node {
	return n.isNode
}

const threeJsPostAdjustment = [0, 0, 0]
const alignAdjustment = [0, 0, 0]
const mountPointAdjustment = [0, 0, 0]
const appliedPosition = [0, 0, 0]

const elOps = new WeakMap<ImperativeBase, ElementOperations>()

export type BaseAttributes = TransformableAttributes

/**
 * @abstract
 * @class ImperativeBase - This is an abstract base class that makes up the
 * foundation for the APIs and functionalities provided by the non-abstract
 * custom element classes.
 *
 * This class generally is not intended for use by the library end user. Normal
 * users will want to extend from [`Scene`](/api/core/Scene) or [`Node`](/api/core/Node)
 * (or their subclasses) instead of this class.
 *
 * For purposes of documentation it is still useful to know what properties and
 * methods subclasses inherit from here.
 *
 * Generally anything that extends from this class becomes a backing class of a
 * LUME HTML element such as `<lume-scene>` and `<lume-node>`, the most basic
 * of the elements.
 *
 * There are two branches of subclasses of ImperativeBase that ImperativeBase
 * is intentionally aware of: `Scene` and `Node`.
 *
 * @extends Settable
 * @extends Transformable
 */

// function makeImperativeBase() {
// TODO switch to @element('element-name', false) and use defineElement in html/index.ts
@element
export class ImperativeBase extends Settable(Transformable) {
	// we don't need this, keep for backward compatibility (mainly
	// all my demos at trusktr.io).
	imperativeCounterpart = this

	// TODO re-organize variables like isScene and isNode, so they come from
	// one place. f.e. isScene is currently also used in DeclarativeBase.

	/** @property {boolean} isScene - True if a subclass of this class is a Scene. */
	isScene = false

	/** @property {boolean} isNode - True if a subclass of this class is a Node. */
	isNode = false

	/**
	 * @readonly
	 * @property {boolean} glLoaded
	 * Returns a boolean indicating whether or not the WebGL rendering features
	 * of a LUME element are loaded and ready.
	 *
	 * All nodes in a `<lume-scene>` element have WebGL rendering disabled by
	 * default.
	 *
	 * If a `<lume-scene>` element has the `webgl` attribute set to
	 * `"false"` (the default), then `glLoaded` will always return `false` for any LUME
	 * elements in the scene.
	 *
	 * If a `<lume-scene>` element has the `webgl` attribute set to
	 * `"true"`, then `glLoaded` will always return `true` for any LUME
	 * elements in the scene only *after* WebGL APIs have been loaded
	 * (otherwise `false` up until then).
	 */
	get glLoaded(): boolean {
		return this._glLoaded
	}

	/**
	 * @readonly
	 * @property {boolean} cssLoaded
	 * Returns a boolean indicating whether or not the CSS rendering features
	 * of a LUME element are loaded and ready.
	 *
	 * All nodes in a `<lume-scene>` element have CSS rendering enabled by
	 * default.
	 *
	 * If a `<lume-scene>` element has the `enableCss` attribute set to
	 * `"false"`, then `cssLoaded` will always return `false` for any LUME
	 * elements in the scene.
	 *
	 * If a `<lume-scene>` element has the `enableCss` attribute set to
	 * `"true"` (the default), then `cssLoaded` will always return `true` for
	 * any LUME elements in the scene only after CSS APIs have been loaded
	 * (otherwise 'false' up until then).
	 */
	get cssLoaded(): boolean {
		return this._cssLoaded
	}

	// We use F-Bounded Polymorphism in the following `three` and `threeCSS`
	// properties by referring to `this` in their type definitions to make
	// it possible for subclasses to define the types of the three and
	// threeCSS properties based on the return type of their
	// `makeThreeObject3d` and `makeThreeCSSObject` methods. A simple
	// example of the pattern is demonstrated here:
	// https://www.typescriptlang.org/play?#code/MYGwhgzhAECCB2BLAtmE0DeAoa0BmA9gdALzQCMATAMxYC+WWokMAwmAC7QCmAHh93gATGAhRpMOaACMwAJ1LQOcgK7d6jZlGgAFcPC7ZcsgF6KqtBk3DaAKnO7ce-QSN37DUkAQfJzNDSwwaQhlMGAuLRhbAAtEeABzABkCADduBSNoYNC5cK5UAGtuWPiEgAoASgAuaBV4QvgCAHd4RlwABzlEVM4nAH1+jjjEgH5agCVuDhU5eFsATw7uAB5hxAgAbQByIpKRhO2AXQA+dugAegvoACFIJyjoLrTEIW4YMGhwEwXoBzAhAR4CBfglpgI5AAaaAQFTSKLvGExAgqEBCaBNLjwRzojjEBwAWjeeHiTnWEAAdFIrtBSjANtB4gJhNx0YQFK46hAMjByssCB0QE5MdAimUYXCERBoSBEMVoAAJWwAWSSFwAIgB5ZWisBIDqozg+CCVKm4MFcdaJKqTaazeZLVbknZ7UqJY4nSS4XCIPDQcoAQnJFMGVoSlSUcUpoYOimDroOVWyMCmMzmi2WayjLrAxTdh1O51wNIppeggJhBGQTi6PT6MJmeD9zUQw0jGxD-T14nQMQyTlLVKkuAcafg7ejQwOUgYVhyYQi0EeYlQIBS6Q5LmE0QO64yXsu1zpjPpBlcrPwPgl8JsHxUw2NSmIaQy3TeZt1ecTNTgSFXB5HO05gxbhml-HsZ0CR52A4PdN2ZNwVzQOCDxpWEbxYJc9WgF85DfJw9iQ9A8SeOQXjebJrw4R0cL9IiPwTMokyyQCxxAsCYMgucQgXSJb3cPVYNw5wEJ3MoUKyGljwZJlzzZK90MeMB72ROQYBI3D8IY3N9iYn89EEgC-iA8dsTAgyDC4xhrEw9UCGSYS+FE8DVwk6lrgAUQmCZNQmf0EiIIRoWkbhgGU7lP24IjRRUUJjLY7Douo5ZKikRjrQjFj4vtdjaQcdRcFnTR+PsRwUKc1wYAsoSN1Q64ADliFfK9ygCgggpkULwoInTotHe0PiomiCD9arUtwdKKky4dsuAsy8scKymCBOLgEUeaYLg5b4DirgyHm0ruC2rAOApMNDwW9RgDO2MaRgoA
	// A limitation is that we can not make the `makeThreeObject3d` or
	// `makeThreeCSSObject` methods protected, because TypeScript does not allow
	// that with F-Bounded Types. To achieve pseudo-protectedness, we
	// could use Symbol for that as in this example:
	// https://www.typescriptlang.org/play?#code/MYGwhgzhAECCB2BLAtmE0DeAoa0BmA9gdALzQCMATAMxYC+WWokMAwmAC7QCmAHh93gATGAhRpMOaACMwAJ1LQOcgK7d6jYAXgQuqANbcxqdGQDKAT2TSCIABQBKTeChwkJgDIEAbtwXYpAAc5RG9ObmgAfUiwdzQAfgAuaAAlbg4VOXgAFQtA7gAeDgALRAgAbQ487gI8aAMjOJAAXQA+RlwAek7oACFICOZXYJ9EIW4YMGhwAC8LaDluMCFtEHmAc3SBOQAaaAgVaSGICf3ighUQIWh4Ai54bm5rjmJFgFpxvEQHpVKIADopN1oNk-tAyuD4AJhE98AQFIJrioTnIYHZ8gRAiAIrc9GB9N91vtDscJnsQIhDNAABLZACyHk6ABEAPJ0+qxRCBS6ceEQByA3CbLickyOZJpDJZXL5Ip-SrVWocwzGNBtSS4XCIOp2ACEJTK-2iorQDl+huNTUUBoqDVVLUc0EgqXSmRy1TlZQVGLqdqabQ6muBTOIEAIyAiwVC4RkA2gx32GTwdQA7ogSuaAZbxCBA7hFlL4JmjTEmlIGECeqCITWoYjYYQFAcji5JioSnzoHY8P9uP9oBisRFPt9CTduCmlNUYEraQzmWyeNiI1D+VJyn6c81xW4cxrNQW3ePJ-by4HdJxEMBlY0c8kqj6b-bFJuTBomK3oOwOF5fAj+IiohNL+fj7sCzYJsAsTQJiHCINoaBrDBf4hOMmZ7C80ArAO8hwcAPIKAa8DrDAaYZiUETfBe8DAH2672iBcj-K+ao7t++75q6WTHl+nBnhWWg6Fw15kA8k7foxmjaLoTqKMA-wmiAQA
	// Original documentation on F-Bounded Polymorphism in TypeScript:
	// https://www.typescriptlang.org/docs/handbook/advanced-types.html#polymorphic-this-types

	__three?: ReturnType<this['makeThreeObject3d']>

	/**
	 * @readonly
	 * @property {Object3D} three - The WebGL rendering content of this
	 * element. Useful if you know Three.js APIs. See
	 * [`Object3D`](https://threejs.org/docs/index.html#api/en/core/Object3D).
	 */
	get three(): ReturnType<this['makeThreeObject3d']> {
		// if (!(this.scene && this.scene.webgl)) return null

		if (!this.__three) this.__three = this.__makeThreeObject3d()

		return this.__three
	}

	__makeThreeObject3d(): ReturnType<this['makeThreeObject3d']> {
		const o = this.makeThreeObject3d() as ReturnType<this['makeThreeObject3d']>
		// Helpful for debugging when looking in devtools.
		// @prod-prune
		o.name = this.tagName + (this.id ? '#' + this.id : '')
		return o
	}

	__threeCSS?: ReturnType<this['makeThreeCSSObject']>

	/**
	 * @readonly
	 * @property {Object3D} threeCSS - The CSS rendering content of this
	 * element. Useful if you know Three.js APIs. See
	 * [`THREE.Object3D`](https://threejs.org/docs/index.html#api/en/core/Object3D).
	 */
	get threeCSS(): ReturnType<this['makeThreeCSSObject']> {
		// if (!(this.scene && !this.scene.disableCss)) return null

		if (!this.__threeCSS) this.__threeCSS = this.__makeThreeCSSObject()

		return this.__threeCSS
	}

	__makeThreeCSSObject() {
		const o = this.makeThreeCSSObject() as ReturnType<this['makeThreeCSSObject']>
		o.name = this.tagName + (this.id ? '#' + this.id : '')
		return o
	}

	connectedCallback() {
		super.connectedCallback()

		this._stopFns.push(
			autorun(() => {
				this.rotation
				this._updateRotation()
			}),
			autorun(() => {
				this.scale
				this._updateScale()
			}),
			autorun(() => {
				this.sizeMode
				this.size

				// Code wrapped with `untrack` causes dependencies not to be
				// tracked within that code, so it won't register more
				// dependencies for this autorun.
				untrack(() => {
					// TODO: Size calculation should happen in a render task
					// just like _calculateMatrix, instead of on each property
					// change, unless the calculatedSize prop is acessed by the
					// user in which case it should trigger a calculation (sort
					// of like DOM properties that cause re-layout). We should
					// document to prefer not to force calculation, and instead
					// observe the property changes (f.e. with autorun()).
					this._calcSize()
				})
			}),
			autorun(() => {
				if (!this.parent) return

				this.parent.calculatedSize

				untrack(() => {
					if (
						this.getSizeMode().x === 'proportional' ||
						this.getSizeMode().y === 'proportional' ||
						this.getSizeMode().z === 'proportional' ||
						this.getAlignPoint().x !== 0 ||
						this.getAlignPoint().y !== 0 ||
						this.getAlignPoint().z !== 0
					) {
						this._calcSize()
						this.needsUpdate()
					}
				})
			}),
			autorun(() => {
				this.sizeMode
				this.size
				this.position
				this.rotation
				this.scale
				this.origin
				this.alignPoint
				this.mountPoint
				this.opacity

				this.needsUpdate()
			}),
		)
	}

	__possiblyLoadThree(child: ImperativeBase): void {
		// children can be non-lib DOM nodes (f.e. div, h1, etc)
		if (isNode(child)) {
			child._triggerLoadGL()
			child._triggerLoadCSS()
		}
	}

	__possiblyUnloadThree(child: ImperativeBase): void {
		// children can be non-lib DOM nodes (f.e. div, h1, etc)
		// TODO, this check is redundant because call site already checks
		// for ImperativeBase? Or do we not want to run this on Scene
		// instances?
		if (isNode(child)) {
			child._triggerUnloadGL()
			child._triggerUnloadCSS()
		}
	}

	/**
	 * Called whenever a node is connected, but this is called with
	 * a connectionType that tells us how the node is connected
	 * (relative to the "flat tree" or "composed tree").
	 *
	 * @param  {"root" | "slot" | "actual"} connectionType - If the
	 * value is "root", then the child was connected as a child of a
	 * shadow root of the current node. If the value is "slot", then
	 * the child was distributed to the current node via a slot. If
	 * the value is "actual", then the child was connect to the
	 * current node as a regular child ("actual" is the same as
	 * childConnectedCallback).
	 */
	childComposedCallback(child: Element, connectionType: ConnectionType): void {
		if (child instanceof ImperativeBase) {
			// If ImperativeBase#add was called first, child's
			// `parent` will already be set, so prevent recursion.
			if (!child.parent) {
				// mirror the DOM connections in the imperative API's virtual scene graph.
				const __updateDOMConnection = connectionType === 'actual'
				this.add(child, __updateDOMConnection)
			}

			// Calculate sizing because proportional size might depend on
			// the new parent.
			child._calcSize()
			child.needsUpdate()

			this.__possiblyLoadThree(child)
		}
	}

	childUncomposedCallback(child: Element, connectionType: ConnectionType): void {
		if (child instanceof ImperativeBase) {
			// If ImperativeBase#removeNode was called first, child's
			// `parent` will already be null, so prevent recursion.
			if (child.parent) {
				// mirror the connection in the imperative API's virtual scene graph.
				const __updateDOMConnection = connectionType === 'actual'
				this.removeNode(child, __updateDOMConnection)
			}

			this.__possiblyUnloadThree(child)
		}
	}

	/**
	 * @readonly
	 * @property {THREE.Scene} scene - The `<lume-scene>` that the element is a
	 * child or grandchild of, or `null` if the element is not.
	 */
	get scene(): Scene {
		// This traverses recursively upward at first, then the value is cached on
		// subsequent reads.

		// NOTE: this._scene is initally null.

		const parent = this.parent
		// const parent = this.parent || this._composedParent

		// if already cached, return it. Or if no parent, return it (it'll be null).
		// Additionally, Scenes have this._scene already set to themselves.
		if (this._scene || !parent) return this._scene!

		if (!(parent instanceof ImperativeBase)) throw new Error('Expected instance of ImperativeBase')

		// if the parent node already has a ref to the scene, use that.
		if (parent._scene) {
			this._scene = parent._scene
		} else if (isScene(parent)) {
			// we could use instanceof here, but that causes a circular dependency
			this._scene = parent
		}
		// otherwise call the scene getter on the parent, which triggers
		// traversal up the scene graph in order to find the root scene (null
		// if none).
		else {
			this._scene = parent.scene
		}

		return this._scene!
	}

	/**
	 * This overrides the `parent` property of the `TreeNode` class to restrict
	 * parents to being `ImperativeBase` (`Node` or `Scene`) instances.
	 */
	// This override serves mainly to change the type of `parent` for
	// subclasses of ImperativeBase.
	// Nodes (f.e. Mesh, Sphere, etc) and Scenes should always have parents
	// that are Nodes or Scenes (at least for now). The overridden add()
	// method below enforces this.
	// @prod-prune
	get parent(): ImperativeBase | null {
		const parent = super.parent

		if (parent && !(parent instanceof ImperativeBase)) throw new TypeError('Parent must be type ImperativeBase.')

		return parent
	}

	/**
	 * @override
	 */
	add(childNode: ImperativeBase, /* private */ __updateDOMConnection = true): this {
		if (!(childNode instanceof ImperativeBase)) return this

		// We cannot add Scenes to Nodes, for now.
		if (isScene(childNode)) {
			return this

			// TODO Figure how to handle nested scenes. We were throwing
			// this error, but it has been harmless not to throw in the
			// existing demos.
			// throw new TypeError(`
			//     A Scene cannot be added to another Node or Scene (at
			//     least for now). To place a Scene in a Node, just mount
			//     a new Scene onto an HTMLNode with Scene.mount().
			// `)
		}

		super.add(childNode)

		// FIXME remove the type cast here and modify it so it is
		// DOM-agnostic for when we run thsi in a non-DOM environment.
		if (__updateDOMConnection) this._elementOperations.connectChildElement(childNode as unknown as HTMLElement)

		return this
	}

	removeNode(childNode: ImperativeBase, /* private */ __updateDOMConnection = true): this {
		if (!isNode(childNode)) return this

		super.removeNode(childNode)

		if (__updateDOMConnection) this._elementOperations.disconnectChildElement(childNode)

		return this
	}

	/**
	 * @method needsUpdate - Schedules a rendering update for the element. Usually you don't need to call this when using the outer APIs.
	 *
	 * But if you're doing something special to a Node or a Scene, f.e.
	 * modifying the [`.three`](#three) or [`.threeCSS`](#threeCSS)
	 * properties whose updates are not tracked, you should call this so
	 * that LUME will know to re-render the visuals for the element.
	 *
	 * Example:
	 *
	 * ```js
	 * const mesh = document.querySelector('lume-mesh')
	 * mesh.three.material.transparent = true
	 * mesh.three.material.opacity = 0.4
	 * mesh.three.add(new THREE.Mesh(...))
	 * mesh.needsUpdate()
	 * ```
	 */
	needsUpdate(): void {
		// we don't need to render until we're connected into a tree with a scene.
		// if (!this.scene || !this.isConnected) return
		// TODO make sure we render when connected into a tree with a scene

		this._willBeRendered = true

		Motor.setNodeToBeRendered(this)
	}

	_glLoaded = false
	@reactive _cssLoaded = false
	_willBeRendered = false

	get _elementOperations(): ElementOperations {
		if (!elOps.has(this)) elOps.set(this, new ElementOperations(this))
		return elOps.get(this)!
	}

	// stores a ref to this Node's root Scene when/if this Node is
	// in a scene.
	@reactive _scene: Scene | null = null

	/**
	 * @protected
	 * @method makeThreeObject3d - Creates a LUME element's Three.js object for
	 * WebGL rendering. `<lume-mesh>` elements overrides this to create and return
	 * [THREE.Mesh](https://threejs.org/docs/index.html?q=mesh#api/en/objects/Mesh) instances,
	 * for example.
	 */
	makeThreeObject3d(): Object3D {
		return new Object3D()
	}

	/**
	 * @protected
	 * @method makeThreeCSSObject - Creates a LUME element's Three.js object
	 * for CSS rendering. At the moment this is not overriden by any
	 * subclasses, and always creates `CSS3DObjectNested` instances for CSS
	 * rendering, which is a modified version of
	 * [THREE.CSS3DObject](https://github.com/mrdoob/three.js/blob/b13eccc8bf1b6aeecf6e5652ba18d2425f6ec22f/examples/js/renderers/CSS3DRenderer.js#L7).
	 */
	makeThreeCSSObject(): Object3D {
		// @prod-prune, this will be only allowed in a DOM environment with CSS
		// rendering. WebGL APIs will eventually work outside a DOM
		// environment.
		if (!(this instanceof HTMLElement)) throw 'API available only in DOM environment.'

		return new CSS3DObjectNested(this)
	}

	_connectThree(): void {
		if (
			this._isPossiblyDistributedToShadowRoot &&
			// check parent isn't a Scene because Scenes always
			// have shadow roots, and we treat distribution into
			// the Scene shacow root different than with all
			// other Nodes.
			this.parent !== this.scene
		) {
			if (this._distributedParent) {
				// TODO make sure this check works.
				// @prod-prune
				// if (!(this._distributedParent instanceof ImperativeBase))
				// 	throw new Error('expected _distributedParent to be ImperativeBase')

				;(this._distributedParent as ImperativeBase).three.add(this.three)
			}
		} else if (this._shadowRootParent) {
			// TODO make sure this check works.
			// @prod-prune
			// if (!(this._shadowRootParent instanceof ImperativeBase))
			// 	throw new Error('expected _distributedParent to be ImperativeBase')

			;(this._shadowRootParent as ImperativeBase).three.add(this.three)
		} else {
			// TODO make sure this check works.
			// @prod-prune
			// TODO instanceof check doesn't work here. Investigate Symbol.hasInstance feature in Mixin.
			// if (!(this.parent instanceof ImperativeBase)) throw new Error('expected parent to be ImperativeBase')

			this.parent && (this.parent as ImperativeBase).three.add(this.three)
		}

		this.needsUpdate()
	}

	_connectThreeCSS(): void {
		// @ts-ignore
		if (
			this._isPossiblyDistributedToShadowRoot &&
			// check parent isn't a Scene because Scenes always
			// have shadow roots, and we treat distribution into
			// the Scene shacow root different than with all
			// other Nodes.
			this.parent !== this.scene
		) {
			if (this._distributedParent) {
				// TODO make sure this check works.
				// @prod-prune
				// if (!(this._distributedParent instanceof ImperativeBase))
				// 	throw new Error('Expected _distributedParent to be a LUME Node.')

				;(this._distributedParent as ImperativeBase).threeCSS.add(this.threeCSS)
			}
		} else if (this._shadowRootParent) {
			// TODO make sure this check works.
			// @prod-prune
			// if (!(this._shadowRootParent instanceof ImperativeBase))
			// 	throw new Error('Expected _distributedParent to be a LUME Node.')

			;(this._shadowRootParent as ImperativeBase).threeCSS.add(this.threeCSS)
		} else {
			// TODO make sure this check works.
			// @prod-prune
			// if (!(this.parent instanceof ImperativeBase)) throw new Error('Expected parent to be a LUME Node.')

			this.parent && (this.parent as ImperativeBase).threeCSS.add(this.threeCSS)
		}

		this.needsUpdate()
	}

	_glStopFns: StopFunction[] = []

	_loadGL(): boolean {
		if (!(this.scene && this.scene.webgl)) return false

		if (this._glLoaded) return false

		this._glLoaded = true

		// we don't let Three update local matrices automatically, we do
		// it ourselves in Transformable._calculateMatrix and
		// Transformable._calculateWorldMatricesInSubtree
		this.three.matrixAutoUpdate = false

		// NOTE, this.parent works here because _loadGL
		// is called by childConnectedCallback (or when
		// distributed to a shadow root) at which point a child
		// is already upgraded and thus has this.parent
		// API ready. Only a Scene has no parent.
		//
		// this.parent && this.parent.three.add(this.three)
		this._connectThree()

		this.needsUpdate()

		return true
	}

	_unloadGL(): boolean {
		if (!this._glLoaded) return false

		this._glLoaded = false

		for (const stop of this._glStopFns) stop()
		this._glStopFns.length = 0

		this.__three && disposeObject(this.__three)
		this.__three = undefined

		this.needsUpdate()

		return true
	}

	_cssStopFns: StopFunction[] = []

	_loadCSS(): boolean {
		const cssIsEnabled = this.scene && this.scene.enableCss

		if (!cssIsEnabled) return false

		if (this._cssLoaded) return false
		this._cssLoaded = true

		// we don't let Three update local matrices automatically, we do
		// it ourselves in Transformable._calculateMatrix and
		// Transformable._calculateWorldMatricesInSubtree
		this.threeCSS.matrixAutoUpdate = false

		// NOTE, this.parent works here because _loadCSS
		// is called by childConnectedCallback (or when
		// distributed to a shadow root) at which point a child
		// is already upgraded and thus has this.parent
		// API ready. Only a Scene has no parent.
		// this.parent && this.parent.threeCSS.add(this.threeCSS)
		this._connectThreeCSS()

		this.needsUpdate()

		return true
	}

	_unloadCSS(): boolean {
		if (!this._cssLoaded) return false

		this._cssLoaded = false

		for (const stop of this._cssStopFns) stop()
		this._cssStopFns.length = 0

		this.__threeCSS && disposeObject(this.__threeCSS)
		this.__threeCSS = undefined

		this.needsUpdate()

		return true
	}

	_triggerLoadGL(): void {
		if (!this._loadGL()) return

		this.emit(Events.BEHAVIOR_GL_LOAD, this)

		defer(async () => {
			// FIXME Can we get rid of the code deferral here? Without the
			// deferral of a total of three microtasks, then GL_LOAD may
			// fire before behaviors have loaded GL (when their
			// connectedCallbacks fire) due to ordering of when custom
			// elements and element-behaviors life cycle methods fire, and
			// thus the user code that relies on GL_LOAD will modify
			// Three.js object properties and then once the behaviors load
			// the behaviors overwrite the users' values.
			await null
			await null

			this.emit(Events.GL_LOAD, this)
		})

		for (const child of this.subnodes) (child as ImperativeBase)._triggerLoadGL()
	}

	_triggerUnloadGL(): void {
		this._unloadGL()
		this.emit(Events.BEHAVIOR_GL_UNLOAD, this)
		defer(() => this.emit(Events.GL_UNLOAD, this))
	}

	_triggerLoadCSS(): void {
		if (!this._loadCSS()) return

		this.emit(Events.CSS_LOAD, this)
		for (const child of this.subnodes) (child as ImperativeBase)._triggerLoadCSS()
	}

	_triggerUnloadCSS(): void {
		this._unloadCSS()
		this.emit(Events.CSS_UNLOAD, this)
	}

	/**
	 * Takes all the current component values (position, rotation, etc) and
	 * calculates a transformation DOMMatrix from them. See "W3C Geometry
	 * Interfaces" to learn about DOMMatrix.
	 *
	 * @method
	 * @private
	 * @memberOf Node
	 *
	 * TODO #66: make sure this is called after size calculations when we
	 * move _calcSize to a render task.
	 */
	_calculateMatrix(): void {
		const align = this.getAlignPoint()
		const mountPoint = this.getMountPoint()
		const position = this.getPosition()
		const origin = this.getOrigin()

		const size = this.calculatedSize

		// THREE-COORDS-TO-DOM-COORDS
		// translate the "mount point" back to the top/left/back of the object
		// (in Three.js it is in the center of the object).
		threeJsPostAdjustment[0] = size.x / 2
		threeJsPostAdjustment[1] = size.y / 2
		threeJsPostAdjustment[2] = size.z / 2

		// TODO If a Scene has a `parent`, it is not mounted directly into a
		// regular DOM element but rather it is child of a Node. In this
		// case we don't want the scene size to be based on observed size
		// of a regular DOM element, but relative to a parent Node just
		// like for all other Nodes.
		const parentSize = this._getParentSize()

		// THREE-COORDS-TO-DOM-COORDS
		// translate the "align" back to the top/left/back of the parent element.
		// We offset this in ElementOperations#applyTransform. The Y
		// value is inverted because we invert it below.
		threeJsPostAdjustment[0] += -parentSize.x / 2
		threeJsPostAdjustment[1] += -parentSize.y / 2
		threeJsPostAdjustment[2] += -parentSize.z / 2

		alignAdjustment[0] = parentSize.x * align.x
		alignAdjustment[1] = parentSize.y * align.y
		alignAdjustment[2] = parentSize.z * align.z

		mountPointAdjustment[0] = size.x * mountPoint.x
		mountPointAdjustment[1] = size.y * mountPoint.y
		mountPointAdjustment[2] = size.z * mountPoint.z

		appliedPosition[0] = position.x + alignAdjustment[0] - mountPointAdjustment[0]
		appliedPosition[1] = position.y + alignAdjustment[1] - mountPointAdjustment[1]
		appliedPosition[2] = position.z + alignAdjustment[2] - mountPointAdjustment[2]

		// NOTE We negate Y translation in several places below so that Y
		// goes downward like in DOM's CSS transforms.

		// TODO Make an option that configures whether Y goes up or down.

		this.three.position.set(
			appliedPosition[0] + threeJsPostAdjustment[0],
			// THREE-COORDS-TO-DOM-COORDS negate the Y value so that
			// Three.js' positive Y is downward like DOM.
			-(appliedPosition[1] + threeJsPostAdjustment[1]),
			appliedPosition[2] + threeJsPostAdjustment[2],
		)

		// TODO Besides that Transformable shouldn't know about Three.js
		// objects, it should also not know about Scene.
		const childOfScene = this.threeCSS.parent && this.threeCSS.parent.type === 'Scene'

		// FIXME we shouldn't need this conditional check. See the next XXX.
		if (childOfScene) {
			this.threeCSS.position.set(
				appliedPosition[0] + threeJsPostAdjustment[0],
				// THREE-COORDS-TO-DOM-COORDS negate the Y value so that
				// Three.js' positive Y is downward like DOM.
				-(appliedPosition[1] + threeJsPostAdjustment[1]),
				appliedPosition[2] + threeJsPostAdjustment[2],
			)
		} else {
			// XXX CSS objects that aren't direct child of a scene are
			// already centered on X and Y (not sure why, but maybe
			// CSS3DObjectNested has clues, which is based on
			// THREE.CSS3DObject)
			this.threeCSS.position.set(
				appliedPosition[0],
				-appliedPosition[1],
				appliedPosition[2] + threeJsPostAdjustment[2], // only apply Z offset
			)
		}

		if (origin.x !== 0.5 || origin.y !== 0.5 || origin.z !== 0.5) {
			// Here we multiply by size to convert from a ratio to a range
			// of units, then subtract half because Three.js origin is
			// centered around (0,0,0) meaning Three.js origin goes from
			// -0.5 to 0.5 instead of from 0 to 1.

			this.three.pivot.set(
				origin.x * size.x - size.x / 2,
				// THREE-COORDS-TO-DOM-COORDS negate the Y value so that
				// positive Y means down instead of up (because Three,js Y
				// values go up).
				-(origin.y * size.y - size.y / 2),
				origin.z * size.z - size.z / 2,
			)
			this.threeCSS.pivot.set(
				origin.x * size.x - size.x / 2,
				// THREE-COORDS-TO-DOM-COORDS negate the Y value so that
				// positive Y means down instead of up (because Three,js Y
				// values go up).
				-(origin.y * size.y - size.y / 2),
				origin.z * size.z - size.z / 2,
			)
		}
		// otherwise, use default Three.js origin of (0,0,0) which is
		// equivalent to our (0.5,0.5,0.5), by removing the pivot value.
		else {
			this.three.pivot.set(0, 0, 0)
			this.threeCSS.pivot.set(0, 0, 0)
		}

		this.three.updateMatrix()
		this.threeCSS.updateMatrix()
	}

	_updateRotation(): void {
		const {x, y, z} = this.getRotation()

		// Currently rotation is left-handed as far as values inputted into
		// the LUME APIs. This method converts them to Three's right-handed
		// system.

		// TODO Make an option to use left-handed or right-handed rotation,
		// where right-handed will match with Three.js transforms, while
		// left-handed matches with CSS transforms (but in the latter case
		// using Three.js APIs will not match the same paradigm because the
		// option changes only the LUME API).

		// TODO Make the rotation unit configurable (f.e. use degrees or
		// radians)

		// TODO Make the handedness configurable (f.e. left handed or right
		// handed rotation)

		// We don't negate Y rotation here, but we negate Y translation
		// in _calculateMatrix so that it has the same effect.
		this.three.rotation.set(-toRadians(x), toRadians(y), -toRadians(z))

		const childOfScene = this.parent?.isScene

		// TODO write a comment as to why we needed the childOfScne check to
		// alternate rotation directions here. It's been a while, I forgot
		// why. I should've left a comment when I wrote this!
		this.threeCSS.rotation.set(
			(childOfScene ? -1 : 1) * toRadians(x),
			toRadians(y),
			(childOfScene ? -1 : 1) * toRadians(z),
		)
	}

	_updateScale(): void {
		const {x, y, z} = this.getScale()
		this.three.scale.set(x, y, z)
		this.threeCSS.scale.set(x, y, z)
	}

	_calculateWorldMatricesInSubtree(): void {
		this.three.updateMatrixWorld()
		this.threeCSS.updateMatrixWorld()
		this.emit('worldMatrixUpdate')
	}

	/** This is called by Motor on each update before the GL or CSS renderers will re-render. */
	// TODO rename "render" to "update". "render" is more for the renderer classes.
	_render(_timestamp: number): void {
		// TODO: only run this when necessary (f.e. not if only opacity
		// changed, only if position/align/mountPoint changed, etc)
		this._calculateMatrix()

		// TODO, pass the needed data into the elementOperations calls,
		// instead of relying on ElementOperations knowing about
		// non-HTMLElement features. See the TODOs in __applyStyle and
		// __applyOpacity there.
		this._elementOperations.applyImperativeNodeProperties()
	}

	// This method is used by Motor._renderNodes().
	_getNearestAncestorThatShouldBeRendered(): ImperativeBase | false {
		let parent = this.parent

		while (parent) {
			// TODO it'd be nice to have a way to prune away runtime type checks in prod mode.
			// @prod-prune
			if (!(parent instanceof ImperativeBase)) throw new Error('expected ImperativeBase')

			if (parent._willBeRendered) return parent
			parent = parent.parent
		}

		return false
	}
}

window.addEventListener('error', event => {
	const error = event.error

	// sometimes it can be `null` (f.e. for ScriptErrors).
	if (!error) return

	if (/Illegal constructor/i.test(error.message)) {
		console.error(`
			One of the reasons the following error can happen is if a Custom
			Element is called with 'new' before being defined. Did you forget
			to call 'LUME.useDefaultNames'?  For other reasons, see:
			https://www.google.com/search?q=chrome%20illegal%20constructor
        `)
	}
})
