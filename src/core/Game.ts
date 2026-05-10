import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { Loop } from './Loop';
import { Input } from './Input';
import { World } from '../physics/World';
import { PhysicsDebug } from '../physics/Debug';
import { Playfield } from '../table/Playfield';
import { Ball } from '../table/elements/Ball';
import { Flipper, FLIPPER_DIMENSIONS, FLIPPER_COLORS } from '../table/elements/Flipper';
import { Plunger } from '../table/elements/Plunger';
import { Bumper } from '../table/elements/Bumper';
import { Slingshot } from '../table/elements/Slingshot';
import { ChicagoLanes } from '../table/elements/ChicagoLanes';
import { Ramp } from '../table/elements/Ramp';
import { buildLTrainLoop } from '../table/elements/LTrainLoop';
import { buildCubsRamp } from '../table/elements/CubsRamp';
import { DropTarget, DropTargetBank } from '../table/elements/DropTarget';
import { Spinner } from '../table/elements/Spinner';
import { TeamTarget } from '../table/elements/TeamTarget';
import { ModeManager } from '../game/Modes/TeamMode';
import { Bean } from '../table/elements/Bean';
import { SueHead } from '../table/elements/SueHead';
import { SueMiniGame } from '../game/Modes/SueMiniGame';
import { StateMachine, type GameState } from '../game/StateMachine';
import { showAttract, showBallReady, showBonusCount, showGameOver, loadHighScore, saveHighScore } from '../ui/Overlays';
import { AudioBus } from '../audio/AudioBus';
import { Settings } from './Settings';
import type { TeamId } from '../table/layout';
import { isTouchDevice, setupTouchControls, showStartButton } from '../ui/TouchControls';
import { TABLE, COLORS, Z_BOTTOM, ELEMENTS } from '../table/layout';
import { EventBus } from '../game/Events';
import { Scoring } from '../game/Scoring';
import { ChicagoBonus } from '../game/ChicagoBonus';
import { HUD } from '../ui/HUD';
import { ComicCallouts } from '../ui/ComicCallouts';

/**
 * Top-level orchestrator. Owns renderer, input, fixed-step loop, physics
 * world, the table, ball, flippers, plunger, bumpers/slings, and (now) the
 * scoring system + HUD.
 *
 * Chunk 5: bumpers + slingshots + score + HUD + comic callouts.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loop: Loop;
  private readonly input: Input;

  private world!: World;
  private debug!: PhysicsDebug;
  private playfield!: Playfield;
  private ball!: Ball;
  private flipperLeft!: Flipper;
  private flipperRight!: Flipper;
  private plunger!: Plunger;
  private bumpers: Bumper[] = [];
  private slingshots: Slingshot[] = [];
  private chicagoLanes!: ChicagoLanes;
  private ramps: Ramp[] = [];
  private dropBank!: DropTargetBank;
  private spinner!: Spinner;
  private teamTargets: TeamTarget[] = [];
  private teamTargetByHandle = new Map<number, TeamTarget>();
  private bean!: Bean;
  private sueHead: SueHead | null = null;
  private sueMiniGame: SueMiniGame | null = null;
  private stateMachine!: StateMachine;
  private overlayDismiss: (() => void) | null = null;
  private audio!: AudioBus;
  private settings!: Settings;

  private bus!: EventBus;
  private scoring!: Scoring;
  private chicagoBonus!: ChicagoBonus;
  private modeManager!: ModeManager;
  private hud!: HUD;
  private callouts!: ComicCallouts;

  /** Lookup from collider handle to the element that owns it. */
  private bumperByHandle = new Map<number, Bumper>();
  private slingByHandle = new Map<number, Slingshot>();

  private drainBelowY!: number;

  private readonly isMobile: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isMobile = isTouchDevice();
    this.renderer = new Renderer(canvas, { mobile: this.isMobile });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.Fog(0x05070a, 3.5, 10);

    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.05,
      40,
    );

    this.input = new Input();
    this.loop = new Loop({
      fixedStep: 1 / 240,
      maxSubSteps: 8,
      onFixedStep: (dt) => this.fixedUpdate(dt),
      onRender: (alpha) => this.render(alpha),
    });

    window.addEventListener('resize', () => this.handleResize());
  }

  async init(): Promise<void> {
    await World.init();
    this.world = new World();
    this.debug = new PhysicsDebug(this.scene);
    this.bus = new EventBus();
    this.scoring = new Scoring(this.bus);
    this.chicagoBonus = new ChicagoBonus(this.bus);
    this.modeManager = new ModeManager(this.bus, this.scoring);
    this.audio = new AudioBus(this.bus);

    this.buildLighting();
    this.playfield = new Playfield(this.scene, this.world);

    this.buildFlippers();
    this.buildPlunger();
    this.ball = new Ball(this.scene, this.world, this.playfield.ballSpawnWorld);
    this.buildBumpers();
    this.buildSlingshots();
    this.chicagoLanes = new ChicagoLanes(
      this.world,
      this.bus,
      this.ball,
      this.chicagoBonus,
      this.playfield.tiltedRoot,
    );

    // White Sox drop target bank + Hawks spinner.
    this.buildDropBank();
    this.buildSpinner();
    this.buildTeamTargets();
    this.bean = new Bean(this.world, this.bus, this.ball, this.playfield.tiltedRoot, this.renderer.raw);

    // Sue's head, the L-train loop, and the Cubs ramp are temporarily
    // disabled — they all live in the upper-right area and were piling on
    // top of each other, creating a tangle of geometry the ball got stuck
    // in. Get the basic playfield (flippers, bumpers, slings, lanes,
    // targets, drops, spinner, Bean) feeling solid first, then bring
    // these back one at a time with re-tuned positions.
    void buildLTrainLoop;
    void buildCubsRamp;
    void SueHead;
    void SueMiniGame;

    this.positionCamera();
    const drainProbe = new THREE.Vector3();
    this.playfield.localToWorld(0, 0, Z_BOTTOM, drainProbe);
    this.drainBelowY = drainProbe.y - 0.25;

    this.hud = new HUD(this.scoring, this.bus);
    this.hud.setMode('PLAY');
    this.hud.setBall(1, 3);
    this.callouts = new ComicCallouts(this.bus, this.camera, this.canvas);

    // State machine — owns the high-level game flow.
    this.stateMachine = new StateMachine(
      this.bus,
      {
        scoring: this.scoring,
        chicagoBonus: this.chicagoBonus,
        modeManager: this.modeManager,
        sueMiniGame: this.sueMiniGame,
      },
      (s) => this.onStateChange(s),
    );

    // Now that the scene + camera exist, attach the post-processing chain.
    this.renderer.attach(this.scene, this.camera);

    this.settings = new Settings(this.renderer, {
      onAudioMutedChange: (m) => this.audio.setMuted(m),
      onRespawnBall: () => this.ball.respawn(this.playfield.ballSpawnWorld),
      onForceModeStart: (team) => this.bus.emit({ type: 'teamTargetHit', team: team as TeamId }),
    });

    this.wireContactHandlers();
    this.handleResize();
  }

  start(): void {
    this.input.attach();
    this.input.on((action, type) => {
      // Block gameplay input when not in a playable state.
      const playable = this.stateMachine.state === 'ballReady' || this.stateMachine.state === 'ballInPlay';

      if (action === 'flipperLeft' && playable) {
        if (type === 'down') this.flipperLeft.press();
        else this.flipperLeft.release();
        return;
      }
      if (action === 'flipperRight' && playable) {
        if (type === 'down') this.flipperRight.press();
        else this.flipperRight.release();
        return;
      }
      if (action === 'plunger' && playable) {
        if (type === 'down') this.plunger.startCharge();
        else {
          if (this.plunger.release(this.ball)) {
            this.bus.emit({ type: 'ballLaunched' });
          }
        }
        return;
      }
      if (type !== 'down') return;
      if (action === 'debugToggle') this.debug.toggle();
      if (action === 'tweakToggle') this.settings.toggle();
      if (action === 'nudgeLeft' && playable) this.nudgeBall(-0.04, 0);
      if (action === 'nudgeRight' && playable) this.nudgeBall(0.04, 0);
      if (action === 'nudgeUp' && playable) this.nudgeBall(0, -0.04);
      if (action === 'launch') {
        if (this.stateMachine.state === 'attract' || this.stateMachine.state === 'gameOver') {
          this.stateMachine.startGame();
        }
      }
    });
    if (this.isMobile) {
      setupTouchControls(this.input);
    }

    this.loop.start();
    this.stateMachine.begin();
  }

  stop(): void {
    this.loop.stop();
    this.input.detach();
  }

  private buildLighting(): void {
    const key = new THREE.DirectionalLight(0xfff2c8, 1.6);
    key.position.set(2, 4, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 10;
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 2;
    key.shadow.camera.bottom = -2;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.55);
    fill.position.set(-2, 1, -1);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(0, 2, -3);
    this.scene.add(rim);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222244, 0.45));

    const halo = new THREE.PointLight(COLORS.bearsOrange, 1.5, 4);
    halo.position.set(0, -0.4, 0.5);
    this.scene.add(halo);
  }

  private buildFlippers(): void {
    const yLocal = TABLE.wallHeight * 0.45;
    this.flipperLeft = new Flipper(this.world, {
      pivotLocal: new THREE.Vector3(ELEMENTS.flipperLeft.x, yLocal, ELEMENTS.flipperLeft.z),
      length: FLIPPER_DIMENSIONS.length,
      thickness: FLIPPER_DIMENSIONS.thickness,
      restAngle: ELEMENTS.flipperLeft.restAngle,
      raisedAngle: ELEMENTS.flipperLeft.raisedAngle,
      color: FLIPPER_COLORS.left,
      isLeft: true,
      meshParent: this.playfield.tiltedRoot,
    });
    this.flipperRight = new Flipper(this.world, {
      pivotLocal: new THREE.Vector3(ELEMENTS.flipperRight.x, yLocal, ELEMENTS.flipperRight.z),
      length: FLIPPER_DIMENSIONS.length,
      thickness: FLIPPER_DIMENSIONS.thickness,
      restAngle: ELEMENTS.flipperRight.restAngle,
      raisedAngle: ELEMENTS.flipperRight.raisedAngle,
      color: FLIPPER_COLORS.right,
      isLeft: false,
      meshParent: this.playfield.tiltedRoot,
    });
  }

  private buildPlunger(): void {
    const baseLocal = new THREE.Vector3(ELEMENTS.plunger.x, TABLE.wallHeight * 0.4, ELEMENTS.plunger.z);
    const baseWorld = this.playfield.tiltedRoot.localToWorld(baseLocal.clone());
    const fireWorld = new THREE.Vector3(0, 0, -1).transformDirection(this.playfield.tiltedRoot.matrixWorld);
    this.plunger = new Plunger(this.scene, baseWorld, fireWorld);
  }

  private buildBumpers(): void {
    for (let i = 0; i < ELEMENTS.popBumpers.length; i++) {
      const cfg = ELEMENTS.popBumpers[i]!;
      const b = new Bumper(
        this.world,
        this.bus,
        this.ball,
        this.playfield.tiltedRoot,
        cfg.x,
        cfg.z,
        `pop${i}`,
      );
      this.bumpers.push(b);
      this.bumperByHandle.set(b.handle, b);
    }
  }

  private buildDropBank(): void {
    const targets: DropTarget[] = [];
    for (let i = 0; i < ELEMENTS.soxDropTargets.length; i++) {
      const cfg = ELEMENTS.soxDropTargets[i]!;
      targets.push(
        new DropTarget(this.world, this.bus, this.playfield.tiltedRoot, cfg.x, cfg.z, i, COLORS.soxBlack),
      );
    }
    this.dropBank = new DropTargetBank(targets, this.bus);
  }

  private buildSpinner(): void {
    this.spinner = new Spinner(
      this.world,
      this.bus,
      this.playfield.tiltedRoot,
      ELEMENTS.hawksSpinner.x,
      ELEMENTS.hawksSpinner.z,
    );
  }

  private buildTeamTargets(): void {
    for (const cfg of ELEMENTS.teamTargets) {
      const t = new TeamTarget(
        this.world,
        this.bus,
        this.playfield.tiltedRoot,
        cfg.x,
        cfg.z,
        cfg.team,
      );
      this.teamTargets.push(t);
      this.teamTargetByHandle.set(t.handle, t);
    }
  }

  private buildSlingshots(): void {
    const left = new Slingshot(
      this.world,
      this.bus,
      this.ball,
      this.playfield.tiltedRoot,
      ELEMENTS.slingLeft.x,
      ELEMENTS.slingLeft.z,
      'left',
    );
    const right = new Slingshot(
      this.world,
      this.bus,
      this.ball,
      this.playfield.tiltedRoot,
      ELEMENTS.slingRight.x,
      ELEMENTS.slingRight.z,
      'right',
    );
    this.slingshots.push(left, right);
    this.slingByHandle.set(left.handle, left);
    this.slingByHandle.set(right.handle, right);
  }

  private wireContactHandlers(): void {
    const ballHandle = this.ball.collider.handle;
    this.world.onContact((c1, c2, started) => {
      if (!started) return;
      // One side must be the ball.
      let other: typeof c1 | null = null;
      if (c1.handle === ballHandle) other = c2;
      else if (c2.handle === ballHandle) other = c1;
      if (!other) return;

      const bumper = this.bumperByHandle.get(other.handle);
      if (bumper) {
        bumper.onHit();
        return;
      }
      const sling = this.slingByHandle.get(other.handle);
      if (sling) {
        sling.onHit();
        return;
      }
      const drop = this.dropBank.byHandle.get(other.handle);
      if (drop) {
        drop.onHit();
        return;
      }
      const team = this.teamTargetByHandle.get(other.handle);
      if (team) {
        team.onHit();
        return;
      }
      if (other.handle === this.bean.handle) {
        this.bean.onHit();
        return;
      }
    });
  }

  private onStateChange(state: GameState): void {
    if (this.overlayDismiss) {
      this.overlayDismiss();
      this.overlayDismiss = null;
    }
    // Show the on-screen START button only when the player can start a game.
    if (this.isMobile) {
      showStartButton(state === 'attract' || state === 'gameOver');
    }

    switch (state) {
      case 'attract': {
        this.hud.setMode('ATTRACT');
        const o = showAttract(loadHighScore());
        this.overlayDismiss = o.dismiss;
        // Park the ball in the plunger lane while attract is showing.
        this.ball.respawn(this.playfield.ballSpawnWorld);
        this.ball.body.setEnabled(false);
        break;
      }
      case 'ballReady': {
        this.hud.setMode('PLUNGE');
        this.hud.setBall(this.stateMachine.ballNumber, this.stateMachine.maxBalls);
        this.ball.body.setEnabled(true);
        this.ball.respawn(this.playfield.ballSpawnWorld);
        const o = showBallReady(this.stateMachine.ballNumber, this.stateMachine.maxBalls);
        this.overlayDismiss = o.dismiss;
        break;
      }
      case 'ballInPlay':
        this.hud.setMode('PLAY');
        break;
      case 'bonusCount': {
        const bonus = this.stateMachine.computeBonus();
        this.hud.setMode('BONUS');
        this.ball.body.setEnabled(false);
        showBonusCount(bonus, () => {
          if (bonus > 0) this.scoring.award(bonus);
          this.stateMachine.bonusCountFinished();
        });
        break;
      }
      case 'gameOver': {
        this.hud.setMode('GAME OVER');
        const isHigh = saveHighScore(this.scoring.score);
        const o = showGameOver(this.scoring.score, isHigh);
        this.overlayDismiss = o.dismiss;
        this.ball.body.setEnabled(false);
        break;
      }
    }
  }

  /** Apply a nudge impulse to the ball in playfield-local axes (X = sideways,
   *  Z = forward toward CHICAGO). Used by arrow keys. */
  private nudgeBall(localDx: number, localDz: number): void {
    if (!this.ball.body.isEnabled()) return;
    const v = new THREE.Vector3(localDx, 0, localDz);
    v.applyQuaternion(this.playfield.tiltedRoot.getWorldQuaternion(new THREE.Quaternion()));
    this.ball.body.applyImpulse({ x: v.x, y: v.y, z: v.z }, true);
  }

  private positionCamera(): void {
    // Initial pose — handleResize() refines it once we know the actual
    // viewport aspect ratio. Keeping this stub avoids a null-camera
    // window during construction.
    this.camera.position.set(0, TABLE.depth * 0.65, Z_BOTTOM + 0.45);
    this.camera.lookAt(0, 0, -TABLE.depth * 0.05);
  }

  private fixedUpdate(_dt: number): void {
    this.ball.cachePrev();
    this.flipperLeft.cachePrev();
    this.flipperRight.cachePrev();
    this.spinner.cachePrev();
    this.world.step();
    this.chicagoLanes.tick();
    for (const ramp of this.ramps) ramp.tick();
    this.sueHead?.tick();

    // Drain detection — emit once per drain. The state machine's bonus-count
    // -> ballReady transition is what re-spawns and re-enables the ball.
    if (this.ball.body.isEnabled() && this.ball.position.y < this.drainBelowY) {
      // Park the body at the spawn point so the ball doesn't keep falling
      // forever during the bonus-count animation.
      this.ball.body.setEnabled(false);
      this.bus.emit({ type: 'ballDrained' });
    }
  }

  private render(alpha: number): void {
    this.ball.syncRender(alpha);
    this.flipperLeft.syncRender(alpha);
    this.flipperRight.syncRender(alpha);
    this.plunger.update();
    for (const b of this.bumpers) b.update();
    for (const s of this.slingshots) s.update();
    for (const t of this.dropBank.targets) t.update();
    for (const t of this.teamTargets) t.update();
    this.spinner.syncRender(alpha);
    this.chicagoLanes.syncRender();
    this.modeManager.update();
    const active = this.modeManager.activeMode;
    this.hud.setMode(
      active
        ? `${active.banner}  ${Math.ceil(this.modeManager.remainingMs / 1000)}s`
        : 'PLAY',
    );
    this.hud.update();
    this.debug.update(this.world);
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;

    if (aspect < 1.0) {
      // Portrait phone: near-top-down view with a small tilt for depth cues.
      // The table is 1.10m wide x 2.20m deep; with a tall narrow viewport
      // we can't do a low cabinet angle (the table reads as a thin slice),
      // so we frame from above looking slightly toward the player.
      // Camera at (0, 2.5, 0.7), looking at (0, 0, -0.1):
      //   distance ~2.6m, ~17 deg from straight down.
      // FOV 50 + aspect ~0.46 -> visible: 2.4m vertical, 1.1m horizontal,
      // exactly fitting the 2.2m x 1.10m table with breathing room.
      this.camera.fov = 50;
      this.camera.position.set(0, 2.5, 0.7);
      this.camera.lookAt(0, 0, -0.1);
    } else {
      // Desktop / landscape — original framing.
      this.camera.fov = 40;
      this.camera.position.set(0, TABLE.depth * 0.65, Z_BOTTOM + 0.45);
      this.camera.lookAt(0, 0, -TABLE.depth * 0.05);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
