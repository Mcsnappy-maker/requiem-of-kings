import fs from 'fs';

const filePath = 'C:/Users/mohar/OneDrive/Desktop/codex projects/requiem-of-kings/web/src/scene/sceneEngine.ts';
let code = fs.readFileSync(filePath, 'utf8');

// Replace playCaptureCinematic
const captureStart = code.indexOf('  private async playCaptureCinematic(');
const captureEnd = code.indexOf('\r\n  private async passSentence(');

if (captureStart === -1 || captureEnd === -1) {
  console.error('Failed to locate playCaptureCinematic', { captureStart, captureEnd });
  process.exit(1);
}

const newCapture = `  private async playCaptureCinematic(
    attacker: PieceView,
    victim: PieceView,
    from: THREE.Vector3,
    to: THREE.Vector3,
    strikeSquare: SquareId,
  ): Promise<void> {
    const profile = STRIKES[attacker.kind];
    const settings = QUALITY_SETTINGS[this.preset];
    const isShort = this.cinematicIntensity === "short";
    const motionAllowed = !this.reducedMotion;
    const flashAllowed = !this.reducedFlashing;

    const direction = to.clone().sub(from).normalize();
    const standoff = to.clone().sub(direction.clone().multiplyScalar(TILE * 0.52));
    // En passant kills a pawn on a different square than the one moved to.
    const victimSpot = victim.container.position.clone();
    const blow = victimSpot.clone().sub(standoff).setY(0);
    if (blow.lengthSq() < 1e-6) blow.copy(direction);
    blow.normalize();

    const originalFov = this.camera.fov;
    const zoomPunch = motionAllowed ? (isShort ? profile.zoom * 0.5 : profile.zoom) : 0;
    if (zoomPunch > 0) {
      void this.tweens.to({
        duration: isShort ? 0.15 : 0.22,
        easing: Ease.outCubic,
        onUpdate: (t) => {
          this.camera.fov = originalFov - zoomPunch * t;
          this.camera.updateProjectionMatrix();
        },
      });
    }

    // Both fighters square up: the attacker charges in, the defender turns to
    // meet its killer so the blow never lands on the back of a head.
    const chargeSpeed = isShort ? profile.charge * 1.4 : profile.charge;
    await Promise.all([
      // Pressing forward into the blow: the same march, a quicker cadence.
      this.glide(attacker, from, standoff, attacker.kind === "n", chargeSpeed),
      victim.turnTowards(standoff, this.tweens, isShort ? 0.2 : 0.3),
    ]);
    attacker.faceTowards(victimSpot);
    // Arrival beat: the march has stopped and the figure is squared up on its
    // target. A held breath here is what makes the blow read as its own action
    // rather than the tail of the walk.
    const windWait = isShort ? profile.wind * 0.4 : profile.wind;
    if (windWait > 0) await wait(windWait);

    // Sentence before execution: the crown drops a column of light on the
    // condemned and the hall is told what is coming (skipped in short intensity).
    if (profile.pillar && !isShort) {
      await this.passSentence(victim, victimSpot, profile.pillar, settings.postFx && flashAllowed);
    }

    // Strike: the skeletal attack clip when the rig carries one, otherwise a
    // wind-up and lunge driven off the runtime node so the board anchor stays
    // put.
    const strike = attacker.hasClip("attack") ? attacker.playAttack() : null;
    if (profile.swing > 0) {
      // The weapon is heard coming round just before it arrives.
      const lead = strike && strike.duration > 0 ? Math.max(0, strike.impact - 0.18) : 0.05;
      audio.bladeWhoosh({
        pan: this.stereoPan(standoff),
        volume: profile.swing,
        weight: profile.heft,
        delay: lead,
      });
    }
    if (strike && strike.duration > 0) await wait(strike.impact);
    else await this.lunge(attacker, direction, profile.heft);

    const impact = victimSpot.clone().setY(0.55);
    const power = profile.power;
    audio.play("capture", Math.min(1, 0.85 * power));
    // The board itself is capped: past a point the tiles stop reading as stone.
    this.strikeImpact(strikeSquare, Math.min(1.5, power));

    // Faction-tuned lighting and particle bursts:
    // White = The Ember Court (molten fire, warm gold)
    // Black = The Hollow Legion (spectral violet, necrotic chill)
    const isEmber = attacker.color === "w";
    const burstColor = isEmber ? 0xffb347 : 0xc084fc;
    const flashIntensity = flashAllowed ? Math.min(4.4, 2.2 * power) : Math.min(1.2, 0.8 * power);
    this.effects.spawnFlash(impact, flashIntensity, flashAllowed ? 0.24 : 0.12);
    this.effects.spawnBurst(impact, burstColor, Math.round(settings.captureParticles * power), {
      speed: 3.4 * (0.9 + power * 0.1),
      life: 0.75,
    });
    if (motionAllowed) {
      this.shake.add(Math.min(1, 0.55 * power));
    }

    // Steel: the cut hangs in the air for a couple of frames after the blade.
    if (profile.slash) {
      const slashColor = isEmber
        ? (attacker.kind === "k" ? 0xffdf9a : 0xff9e3b)
        : (attacker.kind === "k" ? 0xd8b4fe : 0xa855f7);
      void spawnSlash(this.scene, this.tweens, impact, {
        color: slashColor,
        size: profile.slash.size,
        tilt: -0.55 - this.strikeRng.next() * 0.35,
      });
    }

    // Weight: a blow that carries into the floor sends a wave across the stone.
    if (profile.wave) {
      const waveColor = isEmber ? 0xff7a22 : 0x8b5cf6;
      audio.groundSlam({ pan: this.stereoPan(victimSpot), volume: Math.min(1, power * 0.6) });
      void spawnGroundWave(this.scene, this.tweens, victimSpot, {
        color: waveColor,
        radius: profile.wave.radius,
        height: BOARD_TOP + 0.03,
        echo: profile.aftershock > 0.2,
      });
      this.effects.spawnSmoke(victimSpot.clone().setY(BOARD_TOP + 0.14), {
        count: Math.max(4, Math.round(settings.captureParticles * 0.3)),
        radius: 0.5,
        scale: 0.8,
        growth: 3.2,
        life: 1.2,
        speed: 2.4,
        rise: 0.1,
        color: isEmber ? 0x9c8f7d : 0x7c738a,
        opacity: 0.5,
      });
    }

    // A charge does not stop where it strikes: dust keeps going past the body.
    if (profile.wake) {
      this.effects.spawnSmoke(standoff.clone().setY(BOARD_TOP + 0.12), {
        count: Math.max(3, Math.round(settings.captureParticles * 0.2)),
        radius: 0.34,
        scale: 0.6,
        growth: 2.8,
        life: 0.9,
        speed: 0.8,
        rise: 0.15,
        color: 0xa5977f,
        opacity: 0.4,
        drift: direction.clone().multiplyScalar(2.1),
      });
    }

    // Hitstop: on a heavy blow the whole beat holds for a frame or two on
    // contact, which is what makes the hit feel like it connected with mass.
    if (profile.hold > 0 && !isShort) await wait(profile.hold);

    if (!strike || strike.duration === 0) this.recover(attacker, direction, profile.heft);

    // The hall answers a beat later.
    if (profile.aftershock > 0 && motionAllowed) void this.aftershock(strikeSquare, profile.aftershock);

    // The defender goes down while the attacker finishes following through.
    const recovery = strike ? Math.min(0.45, Math.max(0, strike.duration - strike.impact)) : 0.18;
    await Promise.all([this.slay(victim, blow), wait(isShort ? recovery * 0.6 : recovery)]);

    if (zoomPunch > 0) {
      void this.tweens.to({
        duration: isShort ? 0.25 : 0.45,
        easing: Ease.outCubic,
        onUpdate: (t) => {
          this.camera.fov = originalFov - zoomPunch * (1 - t);
          this.camera.updateProjectionMatrix();
        },
      });
    }

    // The corpse is thrown clear in smoke as the victor takes the square.
    await Promise.all([
      this.banish(victim, blow),
      // The last stride onto the square it has just cleared.
      this.glide(attacker, standoff, to, false, isShort ? 2.0 : 1.5),
    ]);
    audio.play("place", 0.5);
  }`;

code = code.slice(0, captureStart) + newCapture.replace(/\n/g, '\r\n') + code.slice(captureEnd);

// Replace playSpellCinematic
const spellStart = code.indexOf('  private async playSpellCinematic(');
const spellEnd = code.indexOf('\r\n  /** Caster with no clip: the shoulders go back over the gathering fire. */');

if (spellStart === -1 || spellEnd === -1) {
  console.error('Failed to locate playSpellCinematic', { spellStart, spellEnd });
  process.exit(1);
}

const newSpell = `  private async playSpellCinematic(
    attacker: PieceView,
    victim: PieceView,
    from: THREE.Vector3,
    to: THREE.Vector3,
    strikeSquare: SquareId,
  ): Promise<void> {
    // En passant aside, the victim stands on the destination square; either way
    // the fire flies at the body, and the blast throws it away from the caster.
    const victimSpot = victim.container.position.clone();
    const blow = victimSpot.clone().sub(from).setY(0);
    if (blow.lengthSq() < 1e-6) blow.copy(to.clone().sub(from).setY(0));
    if (blow.lengthSq() < 1e-6) blow.set(0, 0, 1);
    blow.normalize();

    const isShort = this.cinematicIntensity === "short";
    const motionAllowed = !this.reducedMotion;
    const spell = spellProfile(attacker.kind);
    const originalFov = this.camera.fov;
    const zoomPunch = motionAllowed ? (isShort ? spell.zoom * 0.5 : spell.zoom) : 0;
    if (zoomPunch > 0) {
      void this.tweens.to({
        duration: isShort ? 0.18 : 0.28,
        easing: Ease.outCubic,
        onUpdate: (t) => {
          this.camera.fov = originalFov - zoomPunch * t;
          this.camera.updateProjectionMatrix();
        },
      });
    }

    // The caster levels its staff; the target sees what is coming for it.
    await Promise.all([
      attacker.turnTowards(victimSpot, this.tweens, isShort ? 0.22 : 0.34),
      victim.turnTowards(from, this.tweens, isShort ? 0.2 : 0.32),
    ]);
    attacker.faceTowards(victimSpot);

    // The strike clip doubles as the incantation: fire builds at the crystal
    // right up to the frame the clip would have landed its blow. The sorceress
    // holds hers longer, and holds far more of it.
    const cast = attacker.hasClip("attack") ? attacker.playAttack() : null;
    const gatherBase = cast && cast.duration > 0 ? Math.max(0.34, cast.impact) : 0.55;
    const gather = (isShort ? gatherBase * 0.6 : gatherBase) + (isShort ? spell.gather * 0.4 : spell.gather);
    // No cast clip on this rig: the body does the casting instead of the
    // skeleton — it leans back over the fire it is gathering.
    const byHand = !cast || cast.duration <= 0;
    if (byHand) void this.castWind(attacker, gather);
    await this.gatherSpell(attacker, gather, spell.orb);
    // ...and throws itself after the bolt as it leaves the staff.
    if (byHand) this.castRelease(attacker, blow);

    const impact = victimSpot.clone().setY(0.62);
    if (spell.bolts > 1 && !isShort) {
      // A volley: leaders go first and break on the body, the killing bolt lands
      // behind them and is the one that takes the square.
      const leaders: Promise<void>[] = [];
      for (let i = 0; i < spell.bolts - 1; i += 1) {
        leaders.push(this.throwFireball(attacker, impact, { size: 0.34, delay: i * 0.11, leader: true }));
      }
      await wait(0.18);
      await this.throwFireball(attacker, impact, { size: 0.64 });
      await Promise.all(leaders);
    } else {
      await this.throwFireball(attacker, impact, { size: spell.bolts > 1 ? 0.58 : undefined });
    }
    this.spellBurst(attacker.color, impact, strikeSquare, spell.blast, spell.ring);

    // Dead before the caster has taken a single step.
    await this.slay(victim, blow);

    if (zoomPunch > 0) {
      void this.tweens.to({
        duration: isShort ? 0.25 : 0.45,
        easing: Ease.outCubic,
        onUpdate: (t) => {
          this.camera.fov = originalFov - zoomPunch * (1 - t);
          this.camera.updateProjectionMatrix();
        },
      });
    }

    // The body is cleared off the board, and only then is the square walked to.
    await this.banish(victim, blow);
    if (cast) attacker.playIdle(0.2);
    await this.glide(attacker, from, to, false, isShort ? 1.6 : 1.15);
    audio.play("place", 0.5);
  }`;

code = code.slice(0, spellStart) + newSpell.replace(/\n/g, '\r\n') + code.slice(spellEnd);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated sceneEngine.ts with cinematic polish!');
