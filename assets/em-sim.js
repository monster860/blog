const TIMESCALE = 0.00000002;
const CHARGE_UNIT = 1.60217662e-19;
const ELECTRON_MASS = 9.100938356e-31;
const FIELD_STRENGTH = -0.002;

const POS_SCALE = 2000;
const POS_OX = 480;
const POS_OY = 250;

const HALF_LIFE = 0.0000001;

class EmSim {
	svg; root;

	electrons_group;
	path_circle;

	accel_voltage_elem;
	accel_voltage_value_elem;
	strength_elem;
	strength_value_elem;
	diameter_value_elem;
	
	electrons = new Set();
	last_timestamp = -1;
	electron_time = 0;

	/**
	 * 
	 * @param {HTMLElement} root 
	 */
	constructor(root) {
		this.root = root;
		this.svg = root.querySelector("svg");

		let circle = this.path_circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		circle.setAttributeNS(null, "stroke", "#004488");
		circle.setAttributeNS(null, "stroke-width", "2");
		circle.setAttributeNS(null, "fill", "transparent");
		this.svg.appendChild(circle);

		let egroup = this.electrons_group = document.createElementNS("http://www.w3.org/2000/svg", "g");
		egroup.setAttributeNS(null, "fill", "yellow");
		this.svg.appendChild(egroup);

		this.accel_voltage_elem = root.querySelector(".em-sim-accel-voltage");
		this.accel_voltage_value_elem = root.querySelector(".em-sim-accel-voltage-value");
		this.accel_voltage_elem.addEventListener("input", () => {
			this.accel_voltage_value_elem.textContent = this.accel_voltage_elem.value + " V";
			this.update_circle();
		});

		this.strength_elem = root.querySelector(".em-sim-strength");
		this.strength_value_elem = root.querySelector(".em-sim-strength-value");
		this.strength_elem.addEventListener("input", () => {
			this.strength_value_elem.textContent = (+this.strength_elem.value).toPrecision(2) + " T";
			this.update_circle();
		});

		this.diameter_value_elem = root.querySelector(".em-sim-diameter");

		this.update_circle();

		window.requestAnimationFrame(this.frame);
	}

	simulate(dt) {
		this.electron_time += dt;
		let sim_dt = dt * TIMESCALE;
		if(this.electron_time > 0.05 && this.electrons.size < 300) {
			this.electron_time -= 0.05;

			let svg_elem = document.createElementNS("http://www.w3.org/2000/svg", "circle")
			svg_elem.r.baseVal.value = 3;
			this.electrons_group.appendChild(svg_elem);

			let kinetic_energy = CHARGE_UNIT * +this.accel_voltage_elem.value;
			let velocity_magnitude = Math.sqrt(2 * kinetic_energy / ELECTRON_MASS);

			let velocity_angle = Math.PI / 2 + (Math.random() - 0.5) * 0.1;

			let electron = {
				x: 0,
				y: 0,
				disp_x: 0,
				disp_y: 0,
				vx: Math.cos(velocity_angle) * velocity_magnitude,
				vy: Math.sin(velocity_angle) * velocity_magnitude,
				svg: svg_elem
			};
			this.update_electron_pos(electron);
			this.electrons.add(electron);
		}

		let lorentz_force_magnitude = +this.strength_elem.value * -CHARGE_UNIT;
		for(let electron of this.electrons) {
			let force_x = -electron.vy * lorentz_force_magnitude;
			let force_y = electron.vx * lorentz_force_magnitude;
			let accel_x = force_x / ELECTRON_MASS;
			let accel_y = force_y / ELECTRON_MASS;

			electron.x += electron.vx * sim_dt + accel_x * sim_dt**2 * 0.5;
			electron.y += electron.vy * sim_dt + accel_y * sim_dt**2 * 0.5;
			electron.vx += accel_x * sim_dt;
			electron.vy += accel_y * sim_dt;
			let remove = this.update_electron_pos(electron);
			if(Math.random() > (0.5 ** (sim_dt / HALF_LIFE))) remove = true;
			if(remove) {
				this.electrons_group.removeChild(electron.svg);
				this.electrons.delete(electron);
			}
		}
	}

	update_circle() {
		let circle = this.path_circle;
		
		let kinetic_energy = CHARGE_UNIT * +this.accel_voltage_elem.value;
		let velocity_magnitude = Math.sqrt(2 * kinetic_energy / ELECTRON_MASS);
		let lorentz_accel = +this.strength_elem.value * CHARGE_UNIT * velocity_magnitude / ELECTRON_MASS;
		let radius = velocity_magnitude**2 / lorentz_accel;
		this.diameter_value_elem.textContent = (radius*100 * 2).toFixed(1);
		if(radius != radius || radius == Infinity || radius == -Infinity) radius = 100;
		circle.r.baseVal.value = Math.abs(radius * POS_SCALE);
		circle.cy.baseVal.value = POS_OY;
		circle.cx.baseVal.value = POS_OX + radius*POS_SCALE;

	}

	update_electron_pos(electron) {
		let cx = electron.disp_x = electron.x * POS_SCALE + POS_OX;
		let cy = electron.disp_y = electron.y * POS_SCALE + POS_OY;
		if (cx < 0 || cy < 0 || cx > 500 || cy > 500) return true;
		if(cx > POS_OX-30 && cx < POS_OX+30 && cy < POS_OY && cy > POS_OY-20) return true;
		return false;
	}

	update_electron_svg(electron) {
		electron.svg.cx.baseVal.value = electron.disp_x;
		electron.svg.cy.baseVal.value = electron.disp_y;
	}

	frame = (timestamp) => {
		if(this.last_timestamp < 0) {
			this.last_timestamp = timestamp;
		}
		this.last_timestamp = Math.max(timestamp-1000, this.last_timestamp);
		let dt = (timestamp - this.last_timestamp) / 1000;
		this.last_timestamp = timestamp;

		while(dt > 0) {
			let sim_dt = Math.min(dt, 0.001);
			this.simulate(sim_dt);
			dt -= sim_dt;
		}

		for(let electron of this.electrons) {
			this.update_electron_svg(electron);
		}

		window.requestAnimationFrame(this.frame);
	};
}

for(let elem of document.querySelectorAll(".em-sim-root")) {
	if(elem.classList.contains("em-sim-root-running")) {
		continue;
	}
	elem.classList.add("em-sim-root-running");
	window.em_sim = new EmSim(elem);
}
