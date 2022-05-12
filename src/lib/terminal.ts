import kleur from 'kleur';

export const errorMessage = (message: string) =>
    console.log(`${kleur.red().bold('Error:')} ${message}`);

export const icons = {
    blueCircle: () => kleur.blue('●'),
    greenCheck: () => kleur.green('✔'),
    magentaQuestion: () => kleur.magenta('?'),
    redEx: () => kleur.red('✖'),
    yellowTri: () => kleur.yellow('▲'),
};

export const makeLink = (text: string, url: string) => {
    const OSC = '\u001B]';
    const SEP = ';';
    const BEL = '\u0007';
    return [OSC, '8', SEP, SEP, url, BEL, text, OSC, '8', SEP, SEP, BEL].join(
        ''
    );
};
